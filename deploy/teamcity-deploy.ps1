[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Get-RequiredEnvironmentValue {
    param([Parameter(Mandatory = $true)][string]$Name)

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "TeamCity environment parameter env.$Name is required."
    }

    return $value.Trim()
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE."
    }
}

$checkoutDirectory = $env:TEAMCITY_BUILD_CHECKOUTDIR
if ([string]::IsNullOrWhiteSpace($checkoutDirectory)) {
    $checkoutDirectory = Split-Path -Parent $PSScriptRoot
}

$deployHost = Get-RequiredEnvironmentValue 'DEPLOY_HOST'
$deployUser = Get-RequiredEnvironmentValue 'DEPLOY_USER'
$deployHostKey = Get-RequiredEnvironmentValue 'DEPLOY_HOST_KEY'
$deployPortText = Get-RequiredEnvironmentValue 'DEPLOY_PORT'
$deployRoot = Get-RequiredEnvironmentValue 'DEPLOY_ROOT'

if ($deployHost -notmatch '^[a-zA-Z0-9.-]+$') {
    throw 'DEPLOY_HOST must be an IP address or DNS host name.'
}
if ($deployUser -notmatch '^[a-zA-Z0-9._-]+$') {
    throw 'DEPLOY_USER contains unsupported characters.'
}
if ($deployRoot -notmatch '^/[a-zA-Z0-9._/-]+$') {
    throw 'DEPLOY_ROOT must be a simple absolute Linux path.'
}

$deployPort = 0
if (-not [int]::TryParse($deployPortText, [ref]$deployPort) -or $deployPort -lt 1 -or $deployPort -gt 65535) {
    throw 'DEPLOY_PORT must be between 1 and 65535.'
}

$artifactDirectory = Join-Path $checkoutDirectory 'artifacts'
$releaseFile = Join-Path $artifactDirectory 'frontend-release.txt'
$archiveFile = Join-Path $artifactDirectory 'frontend-archive.txt'
if (-not (Test-Path -LiteralPath $releaseFile -PathType Leaf)) {
    throw 'frontend-release.txt is missing. Run teamcity-build.ps1 first.'
}
if (-not (Test-Path -LiteralPath $archiveFile -PathType Leaf)) {
    throw 'frontend-archive.txt is missing. Run teamcity-build.ps1 first.'
}

$release = (Get-Content -LiteralPath $releaseFile -Raw).Trim()
$archiveName = (Get-Content -LiteralPath $archiveFile -Raw).Trim()
if ($release -notmatch '^[a-z0-9._-]+$') {
    throw 'The generated frontend release is invalid.'
}
if ($archiveName -notmatch '^[a-zA-Z0-9._-]+\.tar\.gz$') {
    throw 'The generated frontend archive name is invalid.'
}

$archivePath = Join-Path $artifactDirectory $archiveName
$serverDeployPath = Join-Path $PSScriptRoot 'server-deploy-frontend.sh'
foreach ($path in @($archivePath, $serverDeployPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required deployment file is missing: $path"
    }
}

$remote = "$deployUser@$deployHost"
$remoteDirectory = "$deployRoot/frontend-incoming/$release"
$knownHostsPath = Join-Path $artifactDirectory 'frontend-deploy-known-hosts'
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($knownHostsPath, "$deployHostKey`n", $utf8WithoutBom)

$identityArguments = @()
if (-not [string]::IsNullOrWhiteSpace($env:DEPLOY_IDENTITY_FILE)) {
    $identityArguments = @('-i', $env:DEPLOY_IDENTITY_FILE)
}

$sshOptions = @(
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', "UserKnownHostsFile=$knownHostsPath",
    '-o', 'ConnectTimeout=15'
) + $identityArguments
$sshArguments = $sshOptions + @('-p', $deployPortText)
$scpArguments = $sshOptions + @('-P', $deployPortText)

Invoke-NativeCommand ssh ($sshArguments + @($remote, "mkdir -p -- '$remoteDirectory'"))
Invoke-NativeCommand scp ($scpArguments + @($archivePath, $serverDeployPath, "${remote}:$remoteDirectory/"))

$remoteCommand = "bash '$remoteDirectory/server-deploy-frontend.sh' '$deployRoot' '$remoteDirectory/$archiveName' '$release'"
Invoke-NativeCommand ssh ($sshArguments + @($remote, $remoteCommand))

Write-Host "Frontend deployment completed on $remote"
