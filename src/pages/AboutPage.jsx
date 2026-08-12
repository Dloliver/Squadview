import LegalLayout from './LegalLayout';

export default function AboutPage() {
  return (
    <LegalLayout
      eyebrow="About SquadView"
      title="A simpler way to follow more than one stream"
      updated="August 12, 2026"
      description="Learn how SquadView helps viewers watch multiple Twitch streams, switch audio focus, follow chat, and save favorite streamers in one responsive view."
    >
      <p>SquadView is a multi stream viewing tool built for people who want to keep up with several Twitch creators at the same time without constantly switching browser tabs. It is operated by Do More Business LLC and is designed to work across phones, tablets, and desktop computers.</p>

      <h2>What SquadView does</h2>
      <p>You can add up to eight Twitch channel names and create one viewing group. SquadView loads the streams that are currently visible, lets you choose which stream has audio focus, and gives you quick access to the active stream's Twitch chat. On larger screens, multiple streams can be arranged in a grid so you can follow several perspectives at once.</p>

      <h2>Why it was built</h2>
      <p>Watching a tournament, group stream, creator collaboration, or several friends often means jumping between tabs and repeatedly muting and unmuting players. SquadView brings those viewing controls into one interface so the viewer can decide which stream to hear while keeping the rest of the group close by.</p>

      <h2>Favorites and saved preferences</h2>
      <p>Favorite streamers and recently entered channels are stored locally in your browser. That makes it faster to rebuild a viewing group without requiring a SquadView account. Local preferences stay on the device and browser where they were saved unless you clear that site's data.</p>

      <h2>Twitch remains the content provider</h2>
      <p>SquadView does not host or reupload Twitch streams. Video and chat are displayed through Twitch's embedded services, and creators remain responsible for their own channels and content. SquadView provides the surrounding viewing interface, layout controls, audio focus tools, favorites, and device friendly experience.</p>

      <h2>Independent product</h2>
      <p>SquadView is an independent product and is not endorsed by or affiliated with Twitch unless explicitly stated. Questions about SquadView itself can be sent through the support page or through Do More Business LLC.</p>
    </LegalLayout>
  );
}
