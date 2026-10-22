Feature: What the virus does to a cell
  Healthy, then an eclipse period while it replicates unseen, then releasing virions, then
  apoptosis. A dead AT1 cell leaves bare basement membrane behind. The measured timings are
  SIMCoV's; the rest is ours and says so.

  Scenario: An infected cell runs through its states in the measured times
    Given one infected cell and no virions around it
    When it is followed minute by minute
    Then it stays in eclipse for about 480 minutes
    And it then releases virions for about 900 minutes
    And it is dead about 180 minutes after that

  Scenario: A producing cell makes a burst of about a thousand virions
    Given one infected cell and no virions around it
    When it is followed to its death
    Then it released about 1000 virions in all

  Scenario: A dead AT1 leaves bare membrane and a dead AT2 does not
    Given one infected AT1 cell and one infected AT2 cell
    When both are followed to their death
    Then the AT1 is denuded and the AT2 is merely dead

  Scenario: Infection needs virions, and more of them infect sooner
    Given a healthy epithelium
    When it is left in clean fluid for a day
    Then nothing is infected
    When it is bathed in virions for an hour
    Then some cells are infected
    And a heavier dose infects more of them

  Scenario: The virus prefers the cells it has a tropism for
    Given a healthy epithelium bathed in virions
    When an hour passes
    Then far more AT2 cells are infected than AT1 cells, per cell

  Scenario: Interferon protects a cell
    Given a healthy epithelium bathed in virions
    When half the cells are fully protected and an hour passes
    Then many fewer of the protected cells are infected
