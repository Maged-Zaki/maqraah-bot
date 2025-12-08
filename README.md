# Maqraah Bot

A Discord bot designed to help users track their daily Qur'an and Hadith reading progress. The bot sends automated reminders, tracks reading progress, and manages personal notes for spiritual growth.

## Features

- **Daily Reminders**: Automated daily reminders for Qur'an and Hadith reading at customizable times
- **Progress Tracking**: Track last read Qur'an page and Hadith number
- **Flexible Configuration**: Set reminder times, timezones, roles to ping, and voice channels
- **Notes System**: Add personal notes to be reminded the next day
- **Voice Channel Integration**: Automatically update voice channel names with reminder times
- **SQLite Database**: Persistent storage for all data
- **Slash Commands**: Modern Discord slash command interface

## Installation

### Prerequisites

- Node.js (v16 or higher)
- A Discord bot token (create one at [Discord Developer Portal](https://discord.com/developers/applications))

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/maqraah-bot.git
   cd maqraah-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your bot credentials:
     ```
     DISCORD_TOKEN=your_bot_token_here
     GUILD_ID=your_guild_id_here
     CHANNEL_ID=your_channel_id_here
     ```

## Configuration

The bot requires three environment variables:

- `DISCORD_TOKEN`: Your Discord bot token
- `GUILD_ID`: The ID of your Discord server (guild)
- `CHANNEL_ID`: The ID of the text channel where reminders will be sent

### Bot Permissions

Ensure your bot has the following permissions in your Discord server:

- Send Messages
- Use Slash Commands
- View Channels
- Manage Channels (for voice channel name updates)

## Commands

### Configuration Commands

- `/configure`

  - Configure bot settings
  - Options:
    - `role`: Role to ping for reminders
    - `voicechannel`: Voice channel to update with time
    - `time`: Daily reminder time (HH:MM AM/PM format)
    - `timezone`: Timezone for reminders (e.g., "Africa/Cairo")

- `/show-configuration`
  - Display current bot configuration settings

### Progress Commands

- `/set-progress`

  - Set your current reading progress
  - Options:
    - `lastpage`: Last Qur'an page read
    - `lasthadith`: Last Hadith read

- `/show-progress`
  - Display current reading progress

### Notes Commands

- `/add-note`

  - Add a personal note to be reminded tomorrow
  - Options:
    - `text`: The note content (required)

- `/remove-my-notes`

  - Remove all your personal notes

- `/remove-all-notes`
  - Remove all notes from all users (admin command)

## How It Works

### Daily Reminders

The bot sends a daily reminder message in the configured channel at the specified time. The reminder includes:

- The next Qur'an page to read (with a direct link to quran.com)
- The next Hadith number
- Any personal notes added by users

Example reminder message:

```
@Role
Page: [605](https://quran.com/page/605)
Hadith: 1501

Notes:
@user1: Remember to reflect on the verses
@user2: Focus on memorization today
```

### Progress Tracking

Users can set their reading progress using `/set-progress`. The bot uses this information to calculate the next page/Hadith for reminders.

### Notes System

Users can add notes using `/add-note`. These notes are stored and included in the next day's reminder, then automatically cleared.

### Voice Channel Updates

If configured, the bot can update a voice channel's name to display the current reminder time in Arabic (e.g., "مقراة الساعة 12:00 PM").

## Usage Examples

### Initial Setup

1. Invite the bot to your server
2. Set environment variables
3. Start the bot: `npm start`
4. Configure the bot:
   ```
   /configure role:@Readers time:8:00 AM timezone:America/New_York
   ```

### Daily Workflow

1. Set your progress: `/set-progress lastpage:150 lasthadith:500`
2. Add a note: `/add-note text:Focus on understanding the context`
3. Check progress: `/show-progress`
4. Receive daily reminder at configured time

## Development

### Running in Development

```bash
npm run dev
```

This uses `ts-node` to run the TypeScript code directly without building.

### Project Structure

```
src/
├── index.ts          # Main bot file
├── database.ts       # SQLite database operations
├── scheduler.ts      # Cron job scheduling
└── commands/         # Slash command implementations
    ├── configure.ts
    ├── show-configuration.ts
    ├── set-progress.ts
    ├── show-progress.ts
    ├── add-note.ts
    ├── remove-my-notes.ts
    └── remove-all-notes.ts
```

### Database Schema

The bot uses SQLite with two tables:

**config** (single row):

- `lastPage`: Last Qur'an page read
- `lastHadith`: Last Hadith read
- `roleId`: Discord role ID for pinging
- `dailyTime`: Reminder time (HH:MM AM/PM)
- `timezone`: IANA timezone identifier
- `voiceChannelId`: Voice channel ID for updates

**notes**:

- `id`: Auto-incrementing primary key
- `userId`: Discord user ID
- `note`: Note text
- `dateAdded`: ISO timestamp

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support or questions:

- Open an issue on GitHub
- Check the Discord server where the bot is running

## Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Uses [node-cron](https://www.npmjs.com/package/node-cron) for scheduling
- SQLite for data persistence
