$ErrorActionPreference = "Stop"

$port = 8000
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
}

function Send-Response {
  param (
    [System.Net.Sockets.NetworkStream] $Stream,
    [int] $Status,
    [string] $StatusText,
    [byte[]] $Body,
    [string] $ContentType
  )

  $header = "HTTP/1.1 $Status $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

Write-Host ""
Write-Host "Servidor de l'agenda actiu."
Write-Host "Obre aquesta adreca a l'iPad: http://IP-DEL-TEU-ORDINADOR:$port"
Write-Host "Per parar-lo, prem Ctrl+C."
Write-Host ""

$listener.Start()

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()

    try {
      $buffer = New-Object byte[] 4096
      $read = $stream.Read($buffer, 0, $buffer.Length)
      $request = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
      $firstLine = ($request -split "`r`n")[0]
      $parts = $firstLine -split " "
      $urlPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
      $urlPath = [System.Uri]::UnescapeDataString(($urlPath -split "\?")[0])

      if ($urlPath -eq "/") {
        $urlPath = "/index.html"
      }

      $relativePath = $urlPath.TrimStart("/") -replace "/", [System.IO.Path]::DirectorySeparatorChar
      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))

      if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        Send-Response $stream 403 "Forbidden" $body "text/plain; charset=utf-8"
      } elseif (Test-Path -LiteralPath $fullPath -PathType Leaf) {
        $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
        $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
        $body = [System.IO.File]::ReadAllBytes($fullPath)
        Send-Response $stream 200 "OK" $body $contentType
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        Send-Response $stream 404 "Not Found" $body "text/plain; charset=utf-8"
      }
    } finally {
      $stream.Close()
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
