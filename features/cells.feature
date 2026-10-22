Feature: The alveolar epithelium
  AT1 cells are thin plates covering almost the whole surface; AT2 cells are small and dotted
  between them. A cell is a point carrying an area, not a patch of the mesh, because an AT2 cell
  is smaller than one triangle.

  Scenario: Every alveolus carries the measured number of cells
    Given an epithelium over the sac
    Then each alveolus has 40 AT1 cells and 77 AT2 cells
    And every cell belongs to exactly one alveolus
    And every cell sits on the surface of its own alveolus

  Scenario: AT1 cells hold almost all of the surface
    Given an epithelium over the sac
    Then AT1 cells hold 93 to 94 percent of the area
    And the areas add up to the area of the sac
    And an AT1 cell is far larger than an AT2 cell

  Scenario: Refining the mesh does not change the epithelium
    Given epithelia over sacs meshed at 20 and at 14 micrometres
    Then both have the same number of cells
    And the cells hold the same share of the area

  Scenario: Every cell is tied to a node it can read and secrete at
    Given an epithelium over the sac
    Then each cell's node belongs to its own alveolus
    And the node is one of the closest to the cell
