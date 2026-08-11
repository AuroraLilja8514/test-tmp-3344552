!macro customInstall
  Push $0
  FileOpen $0 "$INSTDIR\installed.mode" w
  FileWrite $0 "Project Euler Workbench installed mode$\r$\n"
  FileClose $0
  Pop $0
!macroend
