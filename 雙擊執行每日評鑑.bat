@echo off
echo ====================================================
echo Starting SDH Award AI Team (Daily 5-Episode Batch)
echo ====================================================
cd /d "C:\Users\manma\OneDrive\Documents\Antigrivity\SDH Award"
node agent_orchestrator.js
echo.
echo ====================================================
echo Today's batch and HTML compilation completed successfully!
echo Please double-click podcast_evaluation_workflow.html to see results.
echo ====================================================
pause
