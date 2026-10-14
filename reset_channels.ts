import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'chat-store.json');
if (fs.existsSync(dbPath)) {
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  data.channels = [
    { id: 'c-general', name: 'general', description: 'General Chat', createdAt: Date.now(), createdById: 'system-bot' },
    { id: 'c-reports', name: 'reports', description: 'System reports and audit logs', createdAt: Date.now(), createdById: 'system-bot', permissions: { canView: ['admin', 'owner', 'co-owner', 'mod'] } },
    { id: 'c-wall-of-fame', name: 'wall-of-fame', description: 'The Wall of Fame', createdAt: Date.now(), createdById: 'system-bot' },
    { id: 'c-wall-of-shame', name: 'wall-of-shame', description: 'The Wall of Shame', createdAt: Date.now(), createdById: 'system-bot' }
  ];
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  console.log("Channels reset!");
} else {
  console.log("data/chat-store.json not found");
}
