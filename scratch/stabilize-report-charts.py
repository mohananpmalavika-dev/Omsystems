from pathlib import Path
for name in ['dashboard/components/reports/executive-management-report.tsx','dashboard/components/alerts/management-alert-analytics.tsx']:
 p=Path(name);s=p.read_text(encoding='utf-8');s=s.replace('<Bar dataKey','<Bar isAnimationActive={false} dataKey').replace('<Pie data=','<Pie isAnimationActive={false} data=').replace('<Area type=','<Area isAnimationActive={false} type=');p.write_text(s,encoding='utf-8',newline='\n')
