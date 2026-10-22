Feature: An infection spreads through the sac and costs it
  Everything together: cells, virions, interferon, macrophages and the mechanics. What the tests
  pin down is the shape of the thing — that it spreads, that it kills, that killing AT2 cells
  costs the alveolus its surfactant and then its volume — not any fitted curve, because the
  laws that couple damage to mechanics are ours and graded D.

  Scenario: A single infected cell starts a spreading focus
    Given a sac with one infected cell
    When five days pass
    Then many more cells are infected than were seeded
    And virions have reached alveoli other than the one it started in
    And some cells have died

  Scenario: Nothing happens without a virus
    Given a healthy sac
    When five days pass
    Then no cell is infected
    And every alveolus is still open
    And gas exchange is still whole

  Scenario: Killing AT2 cells costs an alveolus its surfactant and then its volume
    Given a sac whose first alveolus has lost most of its AT2 cells
    When a day passes
    Then that alveolus has little surfactant left
    And it breathes less than its neighbours

  Scenario: Dead AT1 cells bare the membrane and let fluid in
    Given a sac whose first alveolus has lost most of its AT1 cells
    When a day passes
    Then that alveolus has taken on fluid
    And gas exchange has fallen

  Scenario: The readouts agree with the state they are read from
    Given a sac with one infected cell
    When five days pass
    Then every readout is a number between zero and its largest sensible value
    And the same snapshot always gives the same readings

  Scenario: An antiviral given early saves cells
    Given two identical sacs, each with one infected cell
    When one of them is given an antiviral at the start and five days pass
    Then the treated sac keeps more of its cells alive
