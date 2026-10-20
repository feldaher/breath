Feature: The alveolar sac is built from closed bubbles
  Each alveolus is a closed membrane of its own, so its volume is exact and it can be given a
  volume to breathe with. Neighbours overlap and are welded where they touch: those welds are
  the shared septa, and they are both what holds the sac together and the path a field takes
  from one alveolus to the next.

  Scenario: Every alveolus encloses the measured alveolar volume
    Given an alveolar sac meshed at 14 micrometres
    Then it has as many alveoli as the tissue asks for
    And every alveolus is a closed surface
    And every alveolus encloses 4.2e6 cubic micrometres, the measured mean

  Scenario: The sac is one connected body
    Given an alveolar sac meshed at 14 micrometres
    Then every alveolus is welded to at least one neighbour
    And the welds join all of them into a single piece
    And every weld joins two different alveoli

  Scenario: Refining the mesh does not change the sac
    Given alveolar sacs meshed at 14 and at 9 micrometres
    Then both enclose the same volume per alveolus
    And both are a single piece
    And the finer one has more nodes

  Scenario: One alveolus is a sac of one
    Given an alveolar sac of a single alveolus
    Then it has one alveolus at the origin
    And there are no welds
