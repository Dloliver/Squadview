# SquadView Grid Chat and Focus Fix

This overwrite keeps the existing refresh restoration and single Stream + Chat pager behavior while refining desktop grid behavior.

## Changes

* Focusing or listening to a stream changes audio/highlighting without moving any tile on the current desktop grid page.
* Changing desktop pages promotes the currently focused stream to the first tile on the destination page.
* From desktop Grid view, Chat replaces the final tile on the current page. A four stream page becomes three streams plus the focused stream chat.
* Selecting Grid again restores all four stream tiles.
* From Solo view, Chat remains one focused stream plus its matching chat.
* Mobile Chat behavior remains one stream plus chat.
* Grid + Chat retains desktop page controls when the group spans multiple pages.
