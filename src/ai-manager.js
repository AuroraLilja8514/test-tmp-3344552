'use strict';

const path = require('node:path');
const { readJson, writeJsonAtomic } = require('./workspace');

function normalizeEndpoint(value) {
  const text = String(value || '').trim();
  if (!text) throw new TypeError('AI completion endpoint is required');
  let url;
  try { url = new URL(text); } catch { throw new TypeError('AI completion endpoint must be a valid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('AI endpoint must use http or https');
  return url.toString();
}

function normalizeTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.2;
  return Math.min(2, Math.max(0, number));
}

function parseCompletionText(payload) {
  const chat = payload?.choices?.[0]?.message?.content;
  if (typeof chat === 'string') return chat;
  if (Array.isArray(chat)) {
    const joined = chat.map((item) => item?.text || item?.content || '').join('');
    if (joined) return joined;
  }
  const legacy = payload?.choices?.[0]?.text;
  if (typeof legacy === 'string') return legacy;
  if (typeof payload?.output_text === 'string') return payload.output_text;
  throw new Error('AI endpoint returned no recognizable completion text');
}

class AIManager {
  constructor({ settingsRoot, safeStorage = null }) {
    this.settingsFile = path.join(settingsRoot, 'ai.json');
    this.safeStorage = safeStorage;
    this.sessionApiKey = '';
  }

  async _encrypt(text) {
    if (!text || !this.safeStorage) return null;
    if (typeof this.safeStorage.encryptStringAsync === 'function') {
      const encrypted = await this.safeStorage.encryptStringAsync(text);
      return Buffer.from(encrypted).toString('base64');
    }
    if (typeof this.safeStorage.isEncryptionAvailable === 'function' && this.safeStorage.isEncryptionAvailable()) {
      return this.safeStorage.encryptString(text).toString('base64');
    }
    return null;
  }

  async _decrypt(encoded) {
    if (!encoded || !this.safeStorage) return '';
    const buffer = Buffer.from(encoded, 'base64');
    if (typeof this.safeStorage.decryptStringAsync === 'function') {
      const result = await this.safeStorage.decryptStringAsync(buffer);
      return result?.result || '';
    }
    if (typeof this.safeStorage.isEncryptionAvailable === 'function' && this.safeStorage.isEncryptionAvailable()) {
      return this.safeStorage.decryptString(buffer);
    }
    return '';
  }

  async loadConfig({ includeSecret = false } = {}) {
    const stored = await readJson(this.settingsFile, {});
    let apiKey = this.sessionApiKey;
    let storedKeyAvailable = Boolean(stored?.encryptedApiKey);
    if (!apiKey && includeSecret && storedKeyAvailable) {
      try { apiKey = await this._decrypt(stored.encryptedApiKey); } catch { apiKey = ''; }
    }
    return {
      endpoint: typeof stored?.endpoint === 'string' ? stored.endpoint : '',
      model: typeof stored?.model === 'string' ? stored.model : '',
      temperature: normalizeTemperature(stored?.temperature),
      rememberKey: storedKeyAvailable,
      storedKeyAvailable,
      ...(includeSecret ? { apiKey } : {}),
    };
  }

  async saveConfig({ endpoint, model, temperature, apiKey = '', rememberKey = false }) {
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const normalizedModel = String(model || '').trim();
    if (!normalizedModel) throw new TypeError('AI model is required');
    const secret = String(apiKey || '').trim();
    if (secret) this.sessionApiKey = secret;

    let encryptedApiKey = null;
    if (rememberKey && secret) encryptedApiKey = await this._encrypt(secret);
    if (rememberKey && !encryptedApiKey) {
      throw new Error('Secure API-key storage is unavailable; leave Remember key disabled');
    }

    const stored = {
      schemaVersion: 1,
      endpoint: normalizedEndpoint,
      model: normalizedModel,
      temperature: normalizeTemperature(temperature),
      ...(encryptedApiKey ? { encryptedApiKey } : {}),
    };
    await writeJsonAtomic(this.settingsFile, stored);
    return this.loadConfig();
  }

  async _resolvedConfig(overrides = {}) {
    const stored = await this.loadConfig({ includeSecret: true });
    const endpoint = normalizeEndpoint(overrides.endpoint || stored.endpoint);
    const model = String(overrides.model || stored.model || '').trim();
    if (!model) throw new TypeError('AI model is required');
    const apiKey = String(overrides.apiKey || stored.apiKey || '').trim();
    return {
      endpoint,
      model,
      apiKey,
      temperature: normalizeTemperature(overrides.temperature ?? stored.temperature),
    };
  }

  async complete({ system, user, apiKey = '', endpoint = '', model = '', temperature = undefined }) {
    const config = await this._resolvedConfig({ apiKey, endpoint, model, temperature });
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: String(system || '') },
          { role: 'user', content: String(user || '') },
        ],
        temperature: config.temperature,
      }),
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (!response.ok) {
      const detail = payload?.error?.message || text.slice(0, 500) || `HTTP ${response.status}`;
      throw new Error(`AI endpoint failed: ${detail}`);
    }
    return { text: parseCompletionText(payload), model: config.model, endpoint: config.endpoint };
  }

  async testConnection(overrides = {}) {
    const result = await this.complete({
      ...overrides,
      system: 'You are a connectivity test. Follow the user instruction exactly.',
      user: 'Reply with exactly: OK',
      temperature: 0,
    });
    return { ok: true, response: result.text.trim().slice(0, 200) };
  }

  async generateArticle({ problemId, sourceText, instruction = '', mode = 'analysis', ...overrides }) {
    const system = [
      'You turn the user\'s own Project Euler notebook material into a clear Markdown explanation.',
      'Use only information supported by the supplied notebook material.',
      'Do not invent algorithms, measurements, derivations, outputs, or claims that are not present or logically implied.',
      'If a reasoning step is incomplete, explicitly identify the missing step instead of fabricating it.',
      'Preserve important mathematics and code, and explain why the approach works rather than merely paraphrasing the code.',
      'Do not reproduce the Project Euler problem statement unless it is present in the supplied user material.',
    ].join(' ');
    const user = [
      `Create a ${mode === 'comparison' ? 'comparison of the selected solutions' : 'solution analysis'} for Project Euler Problem ${problemId}.`,
      instruction ? `Additional user instruction: ${instruction}` : '',
      '',
      'USER-SUPPLIED MATERIAL:',
      String(sourceText || ''),
    ].filter(Boolean).join('\n');
    return this.complete({ ...overrides, system, user });
  }
}

module.exports = { AIManager, normalizeEndpoint, normalizeTemperature, parseCompletionText };
