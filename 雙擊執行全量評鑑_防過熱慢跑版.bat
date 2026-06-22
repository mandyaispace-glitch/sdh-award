@echo off
echo ====================================================
echo Starting SDH Award AI Team (Full Slow Mode)
echo ====================================================
cd /d "C:\Users\manma\OneDrive\Documents\Antigrivity\SDH Award"
node agent_orchestrator.js --full
echo.
echo ====================================================
echo Full batch run and HTML compilation completed!
echo Please double-click podcast_evaluation_workflow.html to see results.
echo ====================================================
pause
