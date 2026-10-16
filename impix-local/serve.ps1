param([int]$Port = 18746)

$siteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
python -m http.server $Port --bind 127.0.0.1 --directory $siteRoot
