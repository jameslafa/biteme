use anyhow::{bail, Context, Result};
use clap::Parser as ClapParser;
use pulldown_cmark::{Event, Parser as MarkdownParser, Tag, TagEnd};
use serde::{Deserialize, Serialize, Serializer};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(ClapParser)]
#[command(name = "recipe-parser")]
#[command(about = "Parse markdown recipes into JSON")]
struct Cli {
    /// Input directory containing recipe markdown files
    #[arg(short, long, default_value = "recipes")]
    input: PathBuf,

    /// Output JSON file path
    #[arg(short, long, default_value = "docs/recipes.json")]
    output: PathBuf,

    /// Enable strict linting mode
    #[arg(short, long)]
    lint: bool,
}

#[derive(Debug, Deserialize, Serialize)]
struct RecipeFrontmatter {
    id: String,
    name: String,
    description: String,
    servings: u32,
    time: u32,
    difficulty: String,
    tags: Vec<String>,
}

#[derive(Debug, Serialize)]
struct Ingredient {
    id: u32,
    text: String,
}

#[derive(Debug, Serialize)]
struct Recipe {
    id: String,
    name: String,
    description: String,
    servings: u32,
    time: u32,
    difficulty: String,
    tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<String>,
    #[serde(serialize_with = "serialize_ingredients_ordered")]
    ingredients: HashMap<String, Vec<Ingredient>>,
    steps: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    serving_suggestions: Option<String>,
}

#[derive(Serialize)]
struct Manifest {
    version: String,
    generated_at: String,
    recipe_count: usize,
}

// Valid ingredient categories (also defines the output order)
const VALID_CATEGORIES: &[&str] = &[
    "Fresh",
    "Fridge",
    "Pantry",
    "Spices",
];

// Custom serializer to maintain category order
fn serialize_ingredients_ordered<S>(
    ingredients: &HashMap<String, Vec<Ingredient>>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    use serde::ser::SerializeMap;
    let mut map = serializer.serialize_map(Some(ingredients.len()))?;

    // Serialize in VALID_CATEGORIES order
    for &category in VALID_CATEGORIES {
        if let Some(items) = ingredients.get(category) {
            map.serialize_entry(category, items)?;
        }
    }

    map.end()
}

fn parse_recipe_file(path: &PathBuf, lint: bool) -> Result<Recipe> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read file: {:?}", path))?;

    // Split frontmatter and content
    let parts: Vec<&str> = content.splitn(3, "---").collect();
    if parts.len() < 3 {
        bail!("Invalid recipe format: missing frontmatter delimiters");
    }

    // Parse frontmatter
    let frontmatter: RecipeFrontmatter = serde_yaml::from_str(parts[1].trim())
        .context("Failed to parse frontmatter")?;

    // Validate frontmatter
    validate_frontmatter(&frontmatter, lint)?;

    let markdown_content = parts[2].trim();

    // Parse markdown content
    let parser = MarkdownParser::new(markdown_content);

    let mut current_section = String::new();
    let mut current_category = String::new();
    let mut ingredients: HashMap<String, Vec<Ingredient>> = HashMap::new();
    let mut steps: Vec<String> = Vec::new();
    let mut notes: Option<String> = None;
    let mut serving_suggestions: Option<String> = None;
    let mut ingredient_id = 1u32;

    let mut in_list = false;
    let mut current_text = String::new();

    let mut current_heading_level = 0;

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                current_heading_level = match level {
                    pulldown_cmark::HeadingLevel::H1 => 1,
                    pulldown_cmark::HeadingLevel::H2 => 2,
                    pulldown_cmark::HeadingLevel::H3 => 3,
                    _ => 0,
                };
                current_text.clear();
            }
            Event::End(TagEnd::Heading(_)) if current_heading_level == 1 && !current_text.is_empty() => {
                current_section = current_text.trim().to_string();
                current_text.clear();
                current_heading_level = 0;
            }
            Event::End(TagEnd::Heading(_)) if current_heading_level == 2 && current_section == "Ingredients" && !current_text.is_empty() => {
                current_category = current_text.trim().to_string();

                // Validate category
                if !VALID_CATEGORIES.contains(&current_category.as_str()) {
                    bail!("Invalid ingredient category: '{}'. Valid categories: {:?}",
                          current_category, VALID_CATEGORIES);
                }

                ingredients.insert(current_category.clone(), Vec::new());
                current_text.clear();
                current_heading_level = 0;
            }
            Event::Start(Tag::List(_)) => {
                in_list = true;
                current_text.clear();
            }
            Event::End(TagEnd::List(_)) => {
                in_list = false;
            }
            Event::Start(Tag::Item) => {
                current_text.clear();
            }
            Event::End(TagEnd::Item) if in_list && current_section == "Ingredients" => {
                let text = current_text.trim().to_string();
                if !text.is_empty() && !current_category.is_empty() {
                    if let Some(category_items) = ingredients.get_mut(&current_category) {
                        category_items.push(Ingredient {
                            id: ingredient_id,
                            text,
                        });
                        ingredient_id += 1;
                    }
                }
                current_text.clear();
            }
            Event::End(TagEnd::Item) if current_section == "Instructions" => {
                let text = current_text.trim().to_string();
                if !text.is_empty() {
                    steps.push(text);
                }
                current_text.clear();
            }
            Event::Start(Tag::Paragraph) => {
                current_text.clear();
            }
            Event::End(TagEnd::Paragraph) if current_section == "Notes" => {
                let text = current_text.trim().to_string();
                if !text.is_empty() {
                    notes = Some(match notes {
                        Some(existing) => format!("{}\n\n{}", existing, text),
                        None => text,
                    });
                }
                current_text.clear();
            }
            Event::End(TagEnd::Paragraph) if current_section == "Serving Suggestions" => {
                let text = current_text.trim().to_string();
                if !text.is_empty() {
                    serving_suggestions = Some(match serving_suggestions {
                        Some(existing) => format!("{}\n\n{}", existing, text),
                        None => text,
                    });
                }
                current_text.clear();
            }
            Event::Text(text) => {
                current_text.push_str(&text);
            }
            Event::Code(code) => {
                current_text.push_str(&code);
            }
            Event::SoftBreak | Event::HardBreak => {
                current_text.push(' ');
            }
            _ => {}
        }
    }

    // Validation
    if ingredients.is_empty() {
        bail!("Recipe must have at least one ingredient category");
    }
    if steps.is_empty() {
        bail!("Recipe must have at least one instruction step");
    }

    // Lint mode: check for empty ingredients and steps
    if lint {
        for (category, items) in &ingredients {
            for item in items {
                if item.text.trim().is_empty() {
                    bail!("Empty ingredient found in category '{}'", category);
                }
            }
        }
        for (idx, step) in steps.iter().enumerate() {
            if step.trim().is_empty() {
                bail!("Empty instruction step found at position {}", idx + 1);
            }
        }
    }

    Ok(Recipe {
        id: frontmatter.id,
        name: frontmatter.name,
        description: frontmatter.description,
        servings: frontmatter.servings,
        time: frontmatter.time,
        difficulty: frontmatter.difficulty,
        tags: frontmatter.tags,
        notes,
        ingredients,
        steps,
        serving_suggestions,
    })
}

fn validate_frontmatter(fm: &RecipeFrontmatter, lint: bool) -> Result<()> {
    // Validate ID format and length
    if fm.id.is_empty() {
        bail!("Recipe ID cannot be empty");
    }
    if fm.id.len() > 100 {
        bail!("Recipe ID too long (max 100 characters): '{}'", fm.id);
    }
    if !fm.id.chars().all(|c| c.is_ascii_lowercase() || c == '-') {
        bail!("Recipe ID must be lowercase with dashes only: '{}'", fm.id);
    }
    if fm.id.starts_with('-') || fm.id.ends_with('-') {
        bail!("Recipe ID cannot start or end with a dash: '{}'", fm.id);
    }
    if fm.id.contains("--") {
        bail!("Recipe ID cannot contain consecutive dashes: '{}'", fm.id);
    }

    // Validate name length
    if fm.name.is_empty() {
        bail!("Recipe name cannot be empty");
    }
    if fm.name.len() > 200 {
        bail!("Recipe name too long (max 200 characters)");
    }

    // Validate description length
    if fm.description.is_empty() {
        bail!("Recipe description cannot be empty");
    }
    if fm.description.len() > 500 {
        bail!("Recipe description too long (max 500 characters)");
    }

    // Validate difficulty
    let valid_difficulties = ["easy", "medium", "hard"];
    if !valid_difficulties.contains(&fm.difficulty.as_str()) {
        bail!("Difficulty must be one of: {:?}, got '{}'", valid_difficulties, fm.difficulty);
    }

    // Validate numeric fields
    if fm.servings == 0 {
        bail!("Servings must be greater than 0");
    }
    if fm.time == 0 {
        bail!("Time must be greater than 0");
    }

    if lint {
        // Additional strict checks for linting mode
        if fm.name.len() < 3 {
            bail!("Name too short (minimum 3 characters)");
        }
        if fm.description.len() < 10 {
            bail!("Description too short (minimum 10 characters)");
        }
        if fm.tags.is_empty() {
            bail!("At least one tag is required");
        }

        // Check for duplicate tags
        let mut seen_tags = std::collections::HashSet::new();
        for tag in &fm.tags {
            if !seen_tags.insert(tag.to_lowercase()) {
                bail!("Duplicate tag found: '{}'", tag);
            }
        }

        // Validate tag format (lowercase, no spaces)
        for tag in &fm.tags {
            if tag.chars().any(|c| c.is_uppercase()) {
                bail!("Tags must be lowercase: '{}'", tag);
            }
            if tag.contains(' ') {
                bail!("Tags must not contain spaces: '{}'", tag);
            }
        }

        // Reasonable ranges
        if fm.servings > 100 {
            bail!("Servings seems unreasonably high: {} (max 100)", fm.servings);
        }
        if fm.time > 1440 {
            bail!("Time seems unreasonably long: {} minutes (max 24 hours)", fm.time);
        }
    }

    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    println!("🔍 Parsing recipes from: {:?}", cli.input);

    if !cli.input.exists() {
        bail!("Input directory does not exist: {:?}", cli.input);
    }

    let mut recipes = Vec::new();
    let mut seen_ids = HashMap::new();

    // Read all .md files in input directory
    for entry in fs::read_dir(&cli.input)
        .with_context(|| format!("Failed to read directory: {:?}", cli.input))?
    {
        let entry = entry?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            println!("  📄 Parsing: {}", path.file_name().unwrap().to_string_lossy());

            match parse_recipe_file(&path, cli.lint) {
                Ok(recipe) => {
                    // Check for duplicate IDs
                    if let Some(existing_path) = seen_ids.get(&recipe.id) {
                        bail!("Duplicate recipe ID '{}' found in {:?} and {:?}",
                              recipe.id, existing_path, path);
                    }
                    seen_ids.insert(recipe.id.clone(), path.clone());
                    recipes.push(recipe);
                }
                Err(e) => {
                    eprintln!("  ❌ Error parsing {:?}: {}", path, e);
                    if cli.lint {
                        return Err(e);
                    }
                }
            }
        }
    }

    if recipes.is_empty() {
        bail!("No valid recipes found in {:?}", cli.input);
    }

    println!("\n✅ Successfully parsed {} recipe(s)", recipes.len());

    // Write JSON output
    let json = serde_json::to_string_pretty(&recipes)
        .context("Failed to serialize recipes to JSON")?;

    fs::write(&cli.output, &json)
        .with_context(|| format!("Failed to write output file: {:?}", cli.output))?;

    println!("📝 Written to: {:?}", cli.output);

    // Generate manifest with hash of recipes.json
    let mut hasher = Sha256::new();
    hasher.update(json.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let manifest = Manifest {
        version: hash,
        generated_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string(),
        recipe_count: recipes.len(),
    };

    // Write manifest.json next to recipes.json
    let manifest_path = cli.output.with_file_name("recipes-manifest.json");
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .context("Failed to serialize manifest")?;

    fs::write(&manifest_path, manifest_json)
        .with_context(|| format!("Failed to write manifest file: {:?}", manifest_path))?;

    println!("📦 Manifest written to: {:?}", manifest_path);

    if cli.lint {
        println!("🔬 Linting passed!");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_valid_recipe_parsing() {
        let test_recipe = r#"---
id: test-recipe
name: Test Recipe
description: A test recipe for unit testing
servings: 2
time: 15
difficulty: easy
tags: [test, vegan]
---

# Ingredients

## Pantry
- 1 cup test ingredient

# Instructions

1. Test step one
2. Test step two
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test-recipe.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();
        assert_eq!(recipe.id, "test-recipe");
        assert_eq!(recipe.name, "Test Recipe");
        assert_eq!(recipe.servings, 2);
        assert_eq!(recipe.steps.len(), 2);
    }

    #[test]
    fn test_invalid_difficulty() {
        let test_recipe = r#"---
id: bad-difficulty
name: Bad Recipe
description: Recipe with invalid difficulty
servings: 2
time: 15
difficulty: super-hard
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("bad-difficulty.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Difficulty must be one of"));
    }

    #[test]
    fn test_invalid_category() {
        let test_recipe = r#"---
id: bad-category
name: Bad Category
description: Recipe with invalid ingredient category
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Invalid Category
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("bad-category.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid ingredient category"));
    }

    #[test]
    fn test_lint_mode_rejects_short_description() {
        let test_recipe = r#"---
id: short-desc
name: Short
description: Short
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("short-desc.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, true);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Description too short"));
    }

    #[test]
    fn test_lint_mode_requires_tags() {
        let test_recipe = r#"---
id: no-tags
name: No Tags Recipe
description: Recipe without tags for testing
servings: 2
time: 15
difficulty: easy
tags: []
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("no-tags.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, true);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("At least one tag is required"));
    }

    #[test]
    fn test_optional_sections() {
        let test_recipe = r#"---
id: with-notes
name: Recipe With Notes
description: Recipe with optional notes and serving suggestions
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Notes

This is a test note.

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one

# Serving Suggestions

Serve with test garnish.
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("with-notes.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();
        assert!(recipe.notes.is_some());
        assert!(recipe.serving_suggestions.is_some());
        assert!(recipe.notes.unwrap().contains("test note"));
    }

    #[test]
    fn test_invalid_id_format_uppercase() {
        let test_recipe = r#"---
id: Bad-Recipe-ID
name: Bad ID
description: Recipe with uppercase in ID
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("bad-id.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("must be lowercase with dashes only"));
    }

    #[test]
    fn test_invalid_id_format_spaces() {
        let test_recipe = r#"---
id: bad recipe id
name: Bad ID
description: Recipe with spaces in ID
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("bad-id-spaces.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("must be lowercase with dashes only"));
    }

    #[test]
    fn test_missing_ingredients_section() {
        let test_recipe = r#"---
id: no-ingredients
name: No Ingredients
description: Recipe without ingredients section
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("no-ingredients.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("at least one ingredient category"));
    }

    #[test]
    fn test_missing_instructions_section() {
        let test_recipe = r#"---
id: no-instructions
name: No Instructions
description: Recipe without instructions section
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("no-instructions.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("at least one instruction step"));
    }

    #[test]
    fn test_invalid_servings_zero() {
        let test_recipe = r#"---
id: zero-servings
name: Zero Servings
description: Recipe with zero servings
servings: 0
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("zero-servings.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Servings must be greater than 0"));
    }

    #[test]
    fn test_invalid_time_zero() {
        let test_recipe = r#"---
id: zero-time
name: Zero Time
description: Recipe with zero time
servings: 2
time: 0
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("zero-time.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Time must be greater than 0"));
    }

    #[test]
    fn test_ingredient_id_assignment() {
        let test_recipe = r#"---
id: id-test
name: ID Assignment Test
description: Test sequential ID assignment
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- First ingredient
- Second ingredient

## Spices
- Third ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("id-test.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();
        
        // Check IDs are sequential
        let pantry = recipe.ingredients.get("Pantry").unwrap();
        assert_eq!(pantry[0].id, 1);
        assert_eq!(pantry[1].id, 2);
        
        let spices = recipe.ingredients.get("Spices").unwrap();
        assert_eq!(spices[0].id, 3);
    }

    #[test]
    fn test_multiple_ingredient_categories() {
        let test_recipe = r#"---
id: multi-category
name: Multiple Categories
description: Recipe with multiple ingredient categories
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Fresh
- 1 onion

## Pantry
- 1 cup rice

## Spices
- 1 tsp salt

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("multi-category.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();
        assert_eq!(recipe.ingredients.len(), 3);
        assert!(recipe.ingredients.contains_key("Fresh"));
        assert!(recipe.ingredients.contains_key("Pantry"));
        assert!(recipe.ingredients.contains_key("Spices"));
    }

    #[test]
    fn test_ingredient_category_order() {
        // Test that categories are always output in VALID_CATEGORIES order
        // regardless of their order in the markdown file
        let test_recipe = r#"---
id: order-test
name: Category Order Test
description: Test category ordering
servings: 2
time: 10
difficulty: easy
tags: [test]
---

# Ingredients

## Spices
- 1 tsp salt

## Fresh
- 1 onion

## Pantry
- 1 cup rice

## Fridge
- 1 cup milk

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("order-test.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();

        // Serialize to JSON to check order
        let json = serde_json::to_string(&recipe).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Get the keys in order they appear in JSON
        let ingredients = value["ingredients"].as_object().unwrap();
        let keys: Vec<&str> = ingredients.keys().map(|s| s.as_str()).collect();

        // Should be in VALID_CATEGORIES order: Fresh, Fridge, Pantry, Spices
        assert_eq!(keys, vec!["Fresh", "Fridge", "Pantry", "Spices"]);
    }

    #[test]
    fn test_missing_frontmatter() {
        let test_recipe = r#"# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("no-frontmatter.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("frontmatter"));
    }

    #[test]
    fn test_lint_uppercase_tag() {
        let test_recipe = r#"---
id: uppercase-tag
name: Uppercase Tag
description: Recipe with uppercase tag
servings: 2
time: 15
difficulty: easy
tags: [Vegan, test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("uppercase-tag.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, true);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Tags must be lowercase"));
    }

    #[test]
    fn test_lint_tag_with_spaces() {
        let test_recipe = r#"---
id: tag-spaces
name: Tag Spaces
description: Recipe with tag containing spaces
servings: 2
time: 15
difficulty: easy
tags: [vegan food, test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("tag-spaces.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, true);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("must not contain spaces"));
    }

    #[test]
    fn test_lint_duplicate_tags() {
        let test_recipe = r#"---
id: dup-tags
name: Duplicate Tags
description: Recipe with duplicate tags
servings: 2
time: 15
difficulty: easy
tags: [vegan, test, vegan]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("dup-tags.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, true);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Duplicate tag"));
    }

    #[test]
    fn test_id_too_long() {
        let long_id = "a".repeat(101);
        let test_recipe = format!(r#"---
id: {}
name: Long ID
description: Recipe with too long ID
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#, long_id);

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("long-id.md");
        fs::write(&test_file, &test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("ID too long"));
    }

    #[test]
    fn test_name_too_long() {
        let long_name = "A".repeat(201);
        let test_recipe = format!(r#"---
id: long-name
name: {}
description: Recipe with too long name
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#, long_name);

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("long-name.md");
        fs::write(&test_file, &test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("name too long"));
    }

    #[test]
    fn test_description_too_long() {
        let long_desc = "A".repeat(501);
        let test_recipe = format!(r#"---
id: long-desc
name: Long Description
description: {}
servings: 2
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#, long_desc);

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("long-desc.md");
        fs::write(&test_file, &test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("description too long"));
    }

    #[test]
    fn test_lint_servings_too_high() {
        let test_recipe = r#"---
id: many-servings
name: Many Servings
description: Recipe with unreasonable servings
servings: 150
time: 15
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("many-servings.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, true);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("unreasonably high"));
    }

    #[test]
    fn test_lint_time_too_long() {
        let test_recipe = r#"---
id: long-time
name: Long Time
description: Recipe with unreasonably long time
servings: 2
time: 2000
difficulty: easy
tags: [test]
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("long-time.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, true);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("unreasonably long"));
    }
}
