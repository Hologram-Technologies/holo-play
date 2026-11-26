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

  @HP-08 @build @rejects
  Scenario: A request is accepted only at one of the four lengths a request has; any other request is answered invalid request
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.accepts_exactly_a_request
    Then a request of any other length is refused
    And prism-code build replays the request play something, answered invalid request
