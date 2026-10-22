Feature: Virions and interferon spread over the sac
  The fields live on the surface, where the lining fluid is. Welds between touching alveoli let
  a field cross a septum, which is how an infection started in one alveolus reaches the others.

  Scenario: A field put into one alveolus stays put without diffusion
    Given fields over the sac
    When virions are placed in one alveolus and nothing is allowed to move
    Then all of them are still in that alveolus

  Scenario: A field crosses from one alveolus to its neighbours
    Given fields over the sac
    When virions are placed in one alveolus and left to diffuse for a day
    Then some of them have reached other alveoli
    And none of them have been lost, with decay switched off

  Scenario: Virions are cleared at the measured rate
    Given fields over the sac
    When virions are spread evenly and left for 100 minutes
    Then the amount left matches exp minus the clearance rate times the time

  Scenario: Stretching the sac dilutes what is on it
    Given fields over the sac with virions spread evenly
    When the sac is inflated and the fields are refitted
    Then the total amount is unchanged
    And the concentration has fallen
