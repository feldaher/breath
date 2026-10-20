Feature: The sac breathes
  Each alveolus is pulled toward a volume target that rises and falls. The pressure comes out of
  the constraint that does the pulling, not from a drawn curve, so a pressure-volume loop is a
  measurement of the model rather than a decoration.

  Scenario: Volume follows the breath
    Given a breathing alveolar sac
    When it is breathed for three full breaths
    Then every alveolus tracked its target within 5 percent throughout
    And the tidal volume of each is within 20 percent of what the tissue asks for

  Scenario: Pressure rises on inspiration and falls on expiration
    Given a breathing alveolar sac
    When it is breathed for three full breaths
    Then the pressure is positive while it is filling
    And the pressure is lower at the bottom of the breath than at the top

  Scenario Outline: The breath does not depend on the number of substeps
    Given a breathing alveolar sac
    When it is breathed for three full breaths with <substeps> substeps
    Then the volume at the top of the breath is within 1 percent of the volume with 16 substeps

    Examples:
      | substeps |
      | 4        |
      | 8        |

  Scenario: Alveoli differ from one another, as measured
    Given a breathing alveolar sac
    Then their tidal volume fractions are not all the same
    And every one of them is positive

  Scenario: Losing surfactant stiffens an alveolus and then collapses it
    Given a breathing alveolar sac
    When one alveolus loses its surfactant
    Then its tidal volume falls well below its neighbours'
    And it collapses while the others stay open

  Scenario: A collapsed alveolus needs a real pressure to reopen
    Given a breathing alveolar sac with one collapsed alveolus
    When its surfactant is restored but no extra pressure is applied
    Then it stays collapsed
    When enough pressure is applied
    Then it opens again

  Scenario: Oedema takes up room an alveolus can no longer use
    Given a breathing alveolar sac
    When one alveolus fills a quarter with fluid
    Then its volume falls by about a quarter
