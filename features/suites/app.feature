Feature: app

  Holo Play's playback decisions, in app/src/App.lex.tex. The page asks the model for each one and does what it answers.

  @HP-01 @build
  Scenario: A lossless representation outranks a lossy one, a deeper lossless one outranks a shallower one, a higher bitrate outranks a lower one, and the order is antisymmetric and ties only equal scores
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.lossless_outranks_lossy, App.deeper_lossless_wins, App.higher_bitrate_wins, App.rank_is_antisymmetric, App.rank_ties_only_equal_scores
    Then the statement holds for every request
    And prism-code build replays the request ranks 000002 000016 000900 000001 000000 000320, a 16-bit lossless file against a 320k lossy one, answered first

  @HP-02 @build
  Scenario: After a representation fails the player advances only to one that remains, and stops once every one was tried
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.retry_stays_in_range, App.retry_ends
    Then the statement holds for every request
    And prism-code build replays the request retry 000002 000002, two representations tried of two, answered exhausted

  @HP-03 @build
  Scenario: An item reaches the audio engine exactly when its bytes are readable and enhancement is on; an unreadable item never does
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.unreadable_never_reaches_engine, App.readable_enhanced_reaches_engine
    Then the statement holds for every request
    And prism-code build replays the request route 000000 000001, an unreadable item with enhancement on, answered direct

  @HP-04 @build
  Scenario: Next, previous and remove keep the playing index inside the queue; next stops at the end without repeat; previous restarts after three seconds
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.ahead_stays_in_queue, App.ahead_stops_at_the_end, App.prior_stays_in_queue, App.prior_restarts_after_three_seconds, App.strip_stays_in_queue
    Then the statement holds for every request
    And prism-code build replays the request ahead 000002 000003 000000 000001, the last of three with repeat off, answered stop

  @HP-05 @build
  Scenario: A pasted link is classed as a track, a stream, an album, a companion stream, a companion import or external; an audio file on any other host is a track
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.audio_file_is_a_track, App.companion_link_needs_the_companion
    Then the statement holds for every request
    And prism-code build replays the request links 000000 000003 000000, a YouTube link with no companion, answered external

  @HP-06 @build
  Scenario: A saved position is resumed only when it lies at least thirty seconds inside the item; within thirty seconds of the end the item is finished
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.resume_stays_inside_the_item, App.near_the_end_is_finished
    Then the statement holds for every request
    And prism-code build replays the request seeks 003570 003600, thirty seconds from the end of an hour, answered finished

  @HP-07 @build
  Scenario: A direct source is always offered; a companion source is offered only when the host reports the companion
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.companion_source_needs_the_companion, App.direct_source_is_always_offered
    Then the statement holds for every request
    And prism-code build replays the request offer 000001 000000, a companion source with no companion, answered hide

  @HP-09 @build
  Scenario: A catalogue song plays from the companion when it is present, else from an open full-length source, else as a preview; a preview is never chosen while a full-length source exists
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.full_source_beats_preview, App.preview_needs_a_preview, App.companion_pick_needs_the_companion, App.something_plays_when_anything_can
    Then the statement holds for every request
    And prism-code build replays the request picks 000000 000001 000001, an open source and a preview with no companion, answered open

  @VZ-01 @build
  Scenario: The picture reacts only while the item plays through the engine and its samples are arriving; an item the page cannot read is never drawn as sound
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.direct_is_never_drawn_as_sound, App.react_needs_live_samples
    Then the statement holds for every request
    And prism-code build replays the request shows 000000 000001 000001, a direct item, answered still

  @VZ-02 @build
  Scenario: A flash is allowed only while fewer than three happened in the last second, and never when calm is asked for
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.at_most_three_flashes_a_second, App.calm_never_flashes
    Then the statement holds for every request
    And prism-code build replays the request flash 000003 000000, three flashes already this second, answered damp

  @VZ-03 @build
  Scenario: A scene is kept for at least eight seconds and left by forty-five, never changes while locked, cuts only on a beat, and never cuts when calm is asked for
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.scene_keeps_its_minimum, App.scene_ends_by_its_maximum, App.locked_scene_stays, App.cut_lands_on_a_beat, App.calm_never_cuts
    Then the statement holds for every request
    And prism-code build replays the request scene 000020 000000 000001 000000, a section change off the beat, answered blend

  @VZ-04 @build
  Scenario: The detail step stays between zero and five, never rises while frames are slow, and holds inside the band between fourteen and twenty-two milliseconds
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.detail_stays_in_range, App.detail_never_rises_when_slow, App.detail_holds_in_the_band
    Then the statement holds for every request
    And prism-code build replays the request depth 000005 000040, the top step at forty milliseconds a frame, answered scale 000004

  @VZ-05 @build
  Scenario: The mood is one of four steps, calm when the sound is quiet, and never calmer for more energy or a faster tempo
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.mood_stays_in_range, App.quiet_is_calm, App.more_energy_is_never_calmer, App.faster_is_never_calmer
    Then the statement holds for every request
    And prism-code build replays the request moods 000060 000150, a strong passage at 150 beats a minute, answered mood 000003

  @VZ-06 @build
  Scenario: The picture leans toward one of bass, mid and treble, keeps it unless another is clearly stronger, and moves only to the strongest
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.attention_stays_in_range, App.attention_holds_unless_clearly_beaten, App.attention_moves_to_the_strongest
    Then the statement holds for every request
    And prism-code build replays the request heeds 000000 000050 000060 000030, bass held with mid ten ahead, answered heed 000000

  @PL-01 @build
  Scenario: A song plays from the companion, else an open full-length stream, else an embedded YouTube or SoundCloud player, else a preview; the player is chosen only when the holospace offers one, never over a stream the app can play itself, and always before a preview
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.player_needs_the_channel, App.own_stream_beats_the_player, App.player_beats_the_preview, App.a_song_plays_when_any_source_has_it
    Then the statement holds for every request
    And prism-code build replays the request plays 000000 000000 000001 000001, a player and a preview with no stream, answered player

  @PL-02 @build @rejects
  Scenario: A YouTube identifier is accepted only as eleven characters, each a letter, a digit, a hyphen or an underscore
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.identifier_characters_are_the_safe_ones
    Then the statement holds for every request
    And prism-code build replays the request ytids dQw4w9WgX/Q, an identifier holding a slash, answered not an identifier

  @PL-03 @build @rejects
  Scenario: An embedded player is shown only at 200 by 200 pixels or more and wholly inside the app's own frame
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.shown_player_is_large_enough, App.shown_player_is_inside_the_app
    Then the statement holds for every request
    And prism-code build replays the request place 000199 000200 000000 000000 000800 000600, a player 199 pixels wide, answered too small

  @HP-08 @build @rejects
  Scenario: A request is accepted only at one of the five lengths a request has; any other request is answered invalid request
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.accepts_exactly_a_request
    Then a request of any other length is refused
    And prism-code build replays the request play something, answered invalid request
