[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

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

function ConvertTo-ReleasePart {
    param([Parameter(Mandatory = $true)][string]$Value)

    $normalized = $Value.ToLowerInvariant() -replace '[^a-z0-9_.-]', '-'
    $normalized = $normalized.Trim('-', '.', '_')
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return 'local'
    }

    return $normalized
}

$checkoutDirectory = $env:TEAMCITY_BUILD_CHECKOUTDIR
if ([string]::IsNullOrWhiteSpace($checkoutDirectory)) {
    $checkoutDirectory = Split-Path -Parent $PSScriptRoot
}

$buildNumber = $env:BUILD_NUMBER
if ([string]::IsNullOrWhiteSpace($buildNumber)) {
    $buildNumber = 'local'
}

$commit = $env:BUILD_VCS_NUMBER
if ([string]::IsNullOrWhiteSpace($commit)) {
    Push-Location $checkoutDirectory
    try {
        $commit = (& git rev-parse --short=12 HEAD).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "git rev-parse failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

$shortCommit = $commit.Substring(0, [Math]::Min(12, $commit.Length))
$release = ConvertTo-ReleasePart "$buildNumber-$shortCommit"
$archiveName = "jokester-frontend-$release.tar.gz"
$artifactDirectory = Join-Path $checkoutDirectory 'artifacts'
$archivePath = Join-Path $artifactDirectory $archiveName
$distDirectory = Join-Path $checkoutDirectory 'dist'

New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null

Push-Location $checkoutDirectory
try {
    $env:VITE_API_BASE_URL = '/api'
    $env:VITE_CLIENT_BUILD = $commit
    Invoke-NativeCommand npm @('ci')
    Invoke-NativeCommand npm @('run', 'build')

    $indexPath = Join-Path $distDirectory 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
        throw 'Frontend build did not produce dist/index.html.'
    }

    Invoke-NativeCommand tar @('-czf', $archivePath, '-C', $distDirectory, '.')
}
finally {
    Pop-Location
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
    (Join-Path $artifactDirectory 'frontend-release.txt'),
    "$release`n",
    $utf8WithoutBom)
[System.IO.File]::WriteAllText(
    (Join-Path $artifactDirectory 'frontend-archive.txt'),
    "$archiveName`n",
    $utf8WithoutBom)

$archive = Get-Item -LiteralPath $archivePath
Write-Host "Built frontend release $release"
Write-Host "Archive: $archivePath ($($archive.Length) bytes)"
Write-Host "##teamcity[setParameter name='env.JOKESTER_FRONTEND_RELEASE' value='$release']"
