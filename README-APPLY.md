# SquadView remove-stream buttons

This overwrite adds an X beside each visible streamer's name. Clicking it removes that streamer from the current group and unmounts the player. If the active streamer is removed, focus moves to the next remaining streamer. Removing the final streamer returns to the home screen. Favorites are not affected.

Apply from the SquadView project root:

```bash
rm -rf /tmp/SquadView-remove-stream-buttons
mkdir -p /tmp/SquadView-remove-stream-buttons
unzip -o ~/Downloads/SquadView-remove-stream-buttons.zip -d /tmp/SquadView-remove-stream-buttons
cp -R /tmp/SquadView-remove-stream-buttons/SquadView-remove-stream-buttons/. .
```

Then run:

```bash
npm run dev
npm run build
```
