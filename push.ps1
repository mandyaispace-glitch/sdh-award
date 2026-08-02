for ($i = 0; $i -lt 15; $i++) {
    git push
    if ($?) {
        Write-Host "Push successful!"
        break
    } else {
        Write-Host "Push failed, retrying in 3 seconds..."
        Start-Sleep -Seconds 3
    }
}
