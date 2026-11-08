# Release script wrapper for PowerShell
$ErrorActionPreference = 'Stop'
node "$PSScriptRoot\release.js" @args
