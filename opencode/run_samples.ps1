$repos = @(
    "https://github.com/octocat/Hello-World.git",
    "https://github.com/heroku/node-js-getting-started.git",
    "https://github.com/docker/getting-started-app.git",
    "https://github.com/tastejs/todomvc.git",
    "https://github.com/tj/commander.js.git",
    "https://github.com/expressjs/express.git",
    "https://github.com/visionmedia/superagent.git",
    "https://github.com/jquense/yup.git",
    "https://github.com/colinhacks/zod.git",
    "https://github.com/websockets/ws.git"
)

$baseDir = "c:\Users\harsh\Desktop\llm\sec_policy_auto\opencode"
$samplesDir = "$baseDir\samples"
$targetDir = "$baseDir\packages\opencode"
$controlsPath = "$baseDir\data\security_controls.json"
$outPath = "$baseDir\outputs\runs"

$env:PINECONE_API_KEY = "pcsk_4g6zPY_DAYJcTqNWnMwCfLUyYxEwKXCxwTFo12cXoCWu9X3sH5W5FhAuJP4zWzuAYTMXxT"
$env:PINECONE_INDEX = "graceful-hazel"

if (-Not (Test-Path -Path $samplesDir)) {
    New-Item -ItemType Directory -Path $samplesDir | Out-Null
}

foreach ($repo in $repos) {
    $repoName = ($repo -split '/')[-1] -replace '\.git$', ''
    $repoPath = "$samplesDir\$repoName"
    
    if (-Not (Test-Path -Path $repoPath)) {
        Write-Host "Cloning $repoName..."
        git clone --depth 1 $repo $repoPath
    } else {
        Write-Host "Repository $repoName already exists."
    }
}

Set-Location $targetDir

foreach ($repo in $repos) {
    $repoName = ($repo -split '/')[-1] -replace '\.git$', ''
    $repoPath = "$samplesDir\$repoName"
    
    Write-Host "Running analyze on $repoName..."
    bun run --conditions=browser ./src/index.ts analyze `
      --path "$repoPath" `
      --mode rag `
      --vector pinecone `
      --controls "$controlsPath" `
      --topk 5 `
      --out "$outPath"
}

Write-Host "Done across all 10 repos."
