const fs = require('fs');
let code = fs.readFileSync('server/moderation.ts', 'utf8');

const injection = `
const customCommands: Record<string, string> = {};

export function handleSlashCommand(
`;

code = code.replace('export function handleSlashCommand(', injection);

const commandLogic = `
  // Custom Commands Hook
  if (customCommands[command]) {
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Command Bot',
      senderAvatarColor: '#a855f7',
      text: customCommands[command],
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // /createcmd command response
  if (command === 'createcmd') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to create commands.' };
    }
    const trigger = argsWithoutWhy[0];
    const response = argsWithoutWhy.slice(1).join(' ');
    if (!trigger || !response) {
      return { handled: true, error: 'Usage: /createcmd <command_name> <response>' };
    }
    customCommands[trigger] = response;
    
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System',
      senderAvatarColor: '#10b981',
      text: \`✅ Created custom command: **/\${trigger}**\`,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // /deletecmd command response
  if (command === 'deletecmd') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to delete commands.' };
    }
    const trigger = argsWithoutWhy[0];
    if (!customCommands[trigger]) {
      return { handled: true, error: \`Command /\${trigger} does not exist.\` };
    }
    delete customCommands[trigger];
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System',
      senderAvatarColor: '#10b981',
      text: \`🗑️ Deleted custom command: **/\${trigger}**\`,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  if (command === 'mute') {
`;

code = code.replace('  if (command === \'mute\') {', commandLogic);
fs.writeFileSync('server/moderation.ts', code);
