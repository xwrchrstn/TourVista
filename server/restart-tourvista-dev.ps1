$ErrorActionPreference = 'Stop'

function Get-TourVistaListeners {
    $connections = netstat.exe -ano -p tcp
    if ($LASTEXITCODE -ne 0) { throw 'Windows could not check the TourVista ports.' }

    foreach ($line in $connections) {
        if ($line -match '^\s*TCP\s+\S+:(5173|3001)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            [pscustomobject]@{ Port = [int]$Matches[1]; ProcessId = [int]$Matches[2] }
        }
    }
}

function Test-NodeCommandArgument($Process, [string]$Argument) {
    return $Process.Name -eq 'node.exe' -and $Process.CommandLine -match ('(?:^|\s)"?' + [regex]::Escape($Argument) + '"?(?=\s|$)')
}

try {
    $listeners = @(Get-TourVistaListeners)
    $frontends = @($listeners | Where-Object Port -eq 5173 | Select-Object -ExpandProperty ProcessId -Unique)
    $backends = @($listeners | Where-Object Port -eq 3001 | Select-Object -ExpandProperty ProcessId -Unique)
    if (!$frontends.Count -and !$backends.Count) { exit 0 }

    if ($frontends.Count -ne 1 -or $backends.Count -gt 1) {
        throw 'TourVista could not identify a single running copy on ports 5173 and 3001. No process was stopped.'
    }
    $viteId = $frontends[0]
    $vite = Get-CimInstance Win32_Process -Filter "ProcessId = $viteId"
    if (!(Test-NodeCommandArgument $vite $env:TOURVISTA_RESTART_VITE)) {
        throw 'Port 5173 is in use by a process outside this TourVista project. No process was stopped.'
    }

    $launcherId = $vite.ParentProcessId
    $launcher = Get-CimInstance Win32_Process -Filter "ProcessId = $launcherId"
    if (!(Test-NodeCommandArgument $launcher 'dev.mjs') -and !(Test-NodeCommandArgument $launcher $env:TOURVISTA_RESTART_LAUNCHER)) {
        throw 'Close the VS Code terminal already running TourVista. The running launcher could not be verified.'
    }
    if ($backends.Count) {
        $apiId = $backends[0]
        $api = Get-CimInstance Win32_Process -Filter "ProcessId = $apiId"
        if ($api.ParentProcessId -ne $launcherId -or !(Test-NodeCommandArgument $api 'server.js')) {
            throw 'Port 3001 is in use separately from this TourVista copy. No process was stopped.'
        }
    }

    $viteProcess = Get-Process -Id $viteId
    $launcherProcess = Get-Process -Id $launcherId
    if ($launcherProcess.StartTime -gt $viteProcess.StartTime -or
        !(@(Get-TourVistaListeners | Where-Object { $_.Port -eq 5173 -and $_.ProcessId -eq $viteId }).Count)) {
        throw 'The running TourVista process changed. Run the restart command again.'
    }

    # The existing launcher closes its API and any MySQL process it started when Vite exits.
    Write-Output 'Stopping the older TourVista copy so the saved email settings can load.'
    Stop-Process -InputObject $viteProcess
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        if ($launcherProcess.HasExited -and !(@(Get-TourVistaListeners).Count)) { exit 0 }
        Start-Sleep -Milliseconds 250
    }
    throw 'The older TourVista copy did not shut down in time. Check its terminal before restarting.'
} catch {
    Write-Output $_.Exception.Message
    exit 1
}
