const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const original = `app.get('/api/channels', optionalAuth, (_req, res) => {
  const channels = chatStore.getChannels();
  res.json({ channels });
});`;

const replacement = `app.get('/api/channels', optionalAuth, (req, res) => {
  const allChannels = chatStore.getChannels();
  const user = (req as any).user;
  
  const filtered = allChannels.filter(c => {
    if (!c.permissions?.canView || c.permissions.canView.length === 0) return true;
    if (!user) return false;
    if (user.role === 'owner' || user.role === 'co-owner') return true;
    
    // Check if user has a role that matches
    const roles = chatStore.getRoles();
    const userRoles = roles.filter(r => (user.roleIds || []).includes(r.id));
    const userRoleNames = userRoles.map(r => r.name.toLowerCase());
    userRoleNames.push(user.role || 'member');
    
    return c.permissions.canView.some(v => userRoleNames.includes(v.toLowerCase()));
  });

  res.json({ channels: filtered });
});`;

code = code.replace(original, replacement);
fs.writeFileSync('server.ts', code);
