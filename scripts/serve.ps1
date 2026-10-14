# Merge content/.generated, then run hugo server in this window.
# Toggling [params.menu] multiLocationMenus remakes the tree; merge logs stay here.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$HugoArgs
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$python = $null
$pythonArgs = @()
if (Get-Command python -ErrorAction SilentlyContinue) {
    $python = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $python = "py"
    $pythonArgs = @("-3")
} else {
    Write-Error "Python is required to remake content/.generated when multiLocationMenus changes."
    exit 1
}

$merge = Join-Path $PSScriptRoot "merge_location_menus.py"
& $python @pythonArgs $merge --watch --serve @HugoArgs
exit $LASTEXITCODE
