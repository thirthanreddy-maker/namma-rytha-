$Shell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $Shell.CreateShortcut("$DesktopPath\Namma Rytha Mobile.lnk")
$Shortcut.TargetPath = "http://localhost:3000/mobile_app.html"
$Shortcut.IconLocation = "c:\Users\THIRTHAN\nimma rytha\logo.png"
$Shortcut.Description = "Namma Rytha Premium Mobile Interface"
$Shortcut.Save()
Write-Host "Shortcut created successfully on Desktop!"
