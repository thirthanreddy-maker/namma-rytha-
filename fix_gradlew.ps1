$file = "android\gradlew.bat"
$content = Get-Content $file -Raw

# Fix 1: Set CLASSPATH to the wrapper jar
$content = $content -replace 'set CLASSPATH=\r\n', "set CLASSPATH=%APP_HOME%gradle\wrapper\gradle-wrapper.jar`r`n"

# Fix 2: Replace -jar invocation with direct class invocation
$content = $content -replace '-classpath "%CLASSPATH%" -jar "%APP_HOME%\\gradle\\wrapper\\gradle-wrapper.jar"', '-classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain'

Set-Content $file $content -NoNewline
Write-Host "gradlew.bat fixed successfully!"
