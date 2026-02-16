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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    date: String,
}

#[derive(Debug, Serialize)]
struct ParsedQuantity {
    amount: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    amount_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unit: Option<String>,
    item: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    secondary_amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    secondary_unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    secondary_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prefix: Option<String>,
}

#[derive(Debug, Serialize)]
struct Ingredient {
    id: u32,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    quantity: Option<ParsedQuantity>,
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
    author: Option<String>,
    date: String,
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

// Known units for ingredient quantity parsing (order matters: longer matches first)
const KNOWN_UNITS: &[&str] = &[
    "tbsp", "tsp", "cups", "cup", "cloves", "clove", "tins", "tin",
    "cans", "can", "medium", "small", "large", "kg", "ml", "g", "l",
];

fn unicode_fraction_value(c: char) -> Option<f64> {
    match c {
        '½' => Some(0.5),
        '⅓' => Some(1.0 / 3.0),
        '¼' => Some(0.25),
        '¾' => Some(0.75),
        '⅔' => Some(2.0 / 3.0),
        _ => None,
    }
}

/// Parse a number from the start of a string. Returns (value, remaining_str).
/// Handles: integers, decimals, unicode fractions, text fractions (1/2),
/// mixed numbers with unicode (1½) and text fractions (1-3/4).
fn parse_amount(s: &str) -> Option<(f64, &str)> {
    let s = s.trim_start();
    if s.is_empty() {
        return None;
    }

    // Try unicode fraction first (e.g., "½ tsp")
    let first_char = s.chars().next()?;
    if let Some(val) = unicode_fraction_value(first_char) {
        return Some((val, &s[first_char.len_utf8()..]));
    }

    // Must start with a digit
    if !first_char.is_ascii_digit() {
        return None;
    }

    // Parse integer/decimal part
    let mut end = 0;
    let mut has_dot = false;
    for (i, c) in s.char_indices() {
        if c.is_ascii_digit() {
            end = i + 1;
        } else if c == '.' && !has_dot && i > 0 {
            has_dot = true;
            end = i + 1;
        } else {
            break;
        }
    }

    let num_str = &s[..end];
    let rest = &s[end..];
    let value: f64 = num_str.parse().ok()?;

    // Check for text fraction: "1/2", "3/4"
    if let Some(after_slash) = rest.strip_prefix('/') {
        let mut denom_end = 0;
        for (i, c) in after_slash.char_indices() {
            if c.is_ascii_digit() {
                denom_end = i + 1;
            } else {
                break;
            }
        }
        if denom_end > 0 {
            if let Ok(denom) = after_slash[..denom_end].parse::<f64>() {
                if denom > 0.0 {
                    return Some((value / denom, &after_slash[denom_end..]));
                }
            }
        }
    }

    // Check for unicode fraction suffix: "1½"
    if let Some(next_char) = rest.chars().next() {
        if let Some(frac_val) = unicode_fraction_value(next_char) {
            return Some((value + frac_val, &rest[next_char.len_utf8()..]));
        }
    }

    // Check for mixed number with dash: "1-3/4"
    if let Some(after_dash) = rest.strip_prefix('-') {
        if let Some(slash_pos) = after_dash.find('/') {
            let numerator_str = &after_dash[..slash_pos];
            if numerator_str.chars().all(|c| c.is_ascii_digit()) && !numerator_str.is_empty() {
                let after_slash = &after_dash[slash_pos + 1..];
                let mut denom_end = 0;
                for (i, c) in after_slash.char_indices() {
                    if c.is_ascii_digit() {
                        denom_end = i + 1;
                    } else {
                        break;
                    }
                }
                if denom_end > 0 {
                    if let (Ok(num), Ok(denom)) = (
                        numerator_str.parse::<f64>(),
                        after_slash[..denom_end].parse::<f64>(),
                    ) {
                        if denom > 0.0 {
                            return Some((value + num / denom, &after_slash[denom_end..]));
                        }
                    }
                }
            }
        }
    }

    Some((value, rest))
}

/// Try to parse a unit from the start of a string.
fn parse_unit(s: &str) -> (Option<String>, &str) {
    let s = s.trim_start();
    for &unit in KNOWN_UNITS {
        if let Some(after) = s.strip_prefix(unit) {
            // Unit must be followed by whitespace, comma, paren, or end of string
            if after.is_empty()
                || after.starts_with(|c: char| c.is_whitespace() || c == ',' || c == '(')
            {
                return (Some(unit.to_string()), after);
            }
        }
    }
    (None, s)
}

/// Try to parse a parenthetical secondary quantity like "(400 ml)" or "(about 150 g)".
fn try_parse_parenthetical(s: &str) -> Option<(f64, Option<String>, Option<String>, &str)> {
    let s = s.trim_start();
    if !s.starts_with('(') {
        return None;
    }

    let close = s.find(')')?;
    let inner = s[1..close].trim();
    let rest = &s[close + 1..];

    // Check for "about" prefix
    let (prefix, inner) = if let Some(after_about) = inner.strip_prefix("about ") {
        (Some("about".to_string()), after_about.trim())
    } else {
        (None, inner)
    };

    // Try to parse amount
    let (amount, inner_rest) = parse_amount(inner)?;

    // Try to parse unit
    let (unit, leftover) = parse_unit(inner_rest);

    // If there's leftover text, this isn't a clean secondary quantity
    if !leftover.trim().is_empty() {
        return None;
    }

    Some((amount, unit, prefix, rest))
}

/// Extract an embedded "(about N unit)" secondary quantity from item text.
fn extract_embedded_secondary(item: &str) -> (Option<f64>, Option<String>, Option<String>, String) {
    if let Some(open) = item.find("(about ") {
        if let Some(rel_close) = item[open..].find(')') {
            let close = open + rel_close;
            let paren_content = &item[open..=close];
            if let Some((amount, unit, prefix, _)) = try_parse_parenthetical(paren_content) {
                let before = item[..open].trim_end();
                let after = item[close + 1..].trim_start();
                let new_item = if after.starts_with(',') {
                    format!("{}{}", before, after)
                } else if !after.is_empty() && !before.is_empty() {
                    format!("{}, {}", before, after)
                } else {
                    format!("{}{}", before, after)
                };
                return (Some(amount), unit, prefix, new_item.trim().to_string());
            }
        }
    }
    (None, None, None, item.to_string())
}

/// Parse an ingredient text into a structured quantity.
/// Returns None for non-scalable ingredients (no leading number).
fn parse_ingredient_quantity(text: &str) -> Option<ParsedQuantity> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }

    // Check for prefix patterns like "Juice of 1/2 lemon"
    let prefixes = ["Juice of ", "Zest of "];
    let (prefix, remaining) = {
        let mut found_prefix = None;
        let mut remaining = text;
        for p in &prefixes {
            if let Some(after) = text.strip_prefix(p) {
                found_prefix = Some(text[..p.len()].trim_end().to_string());
                remaining = after;
                break;
            }
            // Also try lowercase
            let lower_p = p.to_lowercase();
            if let Some(after) = text.to_lowercase().strip_prefix(&lower_p) {
                let _ = after; // just for the check
                found_prefix = Some(text[..p.len()].trim_end().to_string());
                remaining = &text[p.len()..];
                break;
            }
        }
        (found_prefix, remaining)
    };

    // Try to parse leading amount
    let (amount, rest) = parse_amount(remaining)?;

    // Check for range (e.g., "3-4 cloves")
    let (amount_max, rest) = {
        let rest_trimmed = rest;
        if let Some(after_dash) = rest_trimmed
            .strip_prefix('-')
            .or_else(|| rest_trimmed.strip_prefix('\u{2013}'))
        {
            if let Some((max_val, rest2)) = parse_amount(after_dash) {
                (Some(max_val), rest2)
            } else {
                (None, rest)
            }
        } else {
            (None, rest)
        }
    };

    // Try to parse unit
    let (unit, rest) = parse_unit(rest);

    // Check for immediate parenthetical secondary quantity
    let (secondary_amount, secondary_unit, secondary_prefix, rest) =
        if let Some((sec_amount, sec_unit, sec_prefix, rest2)) = try_parse_parenthetical(rest) {
            (Some(sec_amount), sec_unit, sec_prefix, rest2)
        } else {
            (None, None, None, rest)
        };

    // Remaining text is the item
    let mut item = rest.trim().to_string();
    // Strip leading comma
    if let Some(stripped) = item.strip_prefix(',') {
        item = stripped.trim().to_string();
    }

    // If no immediate secondary was found, check for embedded "(about N unit)" in item
    let (secondary_amount, secondary_unit, secondary_prefix, item) = if secondary_amount.is_none()
    {
        extract_embedded_secondary(&item)
    } else {
        (secondary_amount, secondary_unit, secondary_prefix, item)
    };

    Some(ParsedQuantity {
        amount,
        amount_max,
        unit,
        item,
        secondary_amount,
        secondary_unit,
        secondary_prefix,
        prefix,
    })
}

/// Extract all `{reference}` names from step text (lowercased).
fn extract_step_refs(steps_text: &str) -> Vec<String> {
    let mut refs = Vec::new();
    let mut rest = steps_text;
    while let Some(open) = rest.find('{') {
        rest = &rest[open + 1..];
        if let Some(close) = rest.find('}') {
            let inner = &rest[..close];
            if !inner.is_empty() {
                refs.push(inner.to_string());
            }
            rest = &rest[close + 1..];
        } else {
            break;
        }
    }
    refs
}

/// Find ingredients not matched by any step reference.
/// A reference matches an ingredient if it appears as a substring of the ingredient text.
fn find_unreferenced_ingredients(
    ingredients: &HashMap<String, Vec<Ingredient>>,
    step_refs: &[String],
) -> Vec<String> {
    let mut unreferenced = Vec::new();
    for (category, items) in ingredients {
        for ingredient in items {
            let text = ingredient.text.to_lowercase();
            let is_referenced = step_refs.iter().any(|r| text.contains(r));
            if !is_referenced {
                unreferenced.push(format!("{} ({})", ingredient.text, category));
            }
        }
    }
    unreferenced
}

fn check_indentation(content: &str) -> Result<()> {
    let indented_lines = content.lines()
        .filter(|line| !line.trim().is_empty())
        .filter(|line| !line.starts_with("---"))
        .filter(|line| line.starts_with(' '))
        .count();
    let total_lines = content.lines()
        .filter(|line| !line.trim().is_empty())
        .filter(|line| !line.starts_with("---"))
        .count();
    if total_lines > 0 && indented_lines == total_lines {
        bail!(
            "Every line in your recipe starts with extra spaces.\n  \
            This usually happens when copy-pasting from a website or editor.\n  \
            Please remove the leading spaces from all lines and try again."
        );
    }
    Ok(())
}

fn parse_recipe_file(path: &PathBuf, lint: bool) -> Result<Recipe> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read file: {:?}", path))?;

    // Check for copy-paste indentation before parsing
    check_indentation(&content)?;

    // Split frontmatter and content
    let parts: Vec<&str> = content.splitn(3, "---").collect();
    if parts.len() < 3 {
        bail!("Invalid recipe format: missing frontmatter delimiters");
    }

    // Parse frontmatter
    let frontmatter: RecipeFrontmatter = serde_yaml::from_str(parts[1].trim())
        .map_err(|e| friendly_frontmatter_error(&e))?;

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
    let mut current_ingredient_no_scale = false;

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
                current_ingredient_no_scale = false;
            }
            Event::End(TagEnd::Item) if in_list && current_section == "Ingredients" => {
                // Strip any no-scale annotation from text (in case parser included it)
                let text = current_text.trim()
                    .replace("<!-- no-scale -->", "").trim().to_string();
                if !text.is_empty() && !current_category.is_empty() {
                    if let Some(category_items) = ingredients.get_mut(&current_category) {
                        let quantity = if current_ingredient_no_scale {
                            None
                        } else {
                            let q = parse_ingredient_quantity(&text);
                            // Lint warning: ingredient looks scalable but failed to parse
                            if lint && q.is_none() {
                                let first_char = text.chars().next().unwrap_or(' ');
                                if first_char.is_ascii_digit() || unicode_fraction_value(first_char).is_some() {
                                    eprintln!("  \u{26a0}\u{fe0f}  WARNING: Ingredient '{}' (category '{}') starts with a number but could not be parsed for scaling. Add <!-- no-scale --> to suppress.", text, current_category);
                                }
                            }
                            q
                        };
                        category_items.push(Ingredient {
                            id: ingredient_id,
                            text,
                            quantity,
                        });
                        ingredient_id += 1;
                    }
                }
                current_text.clear();
                current_ingredient_no_scale = false;
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
            Event::Html(html) | Event::InlineHtml(html) => {
                if in_list && current_section == "Ingredients" && html.contains("no-scale") {
                    current_ingredient_no_scale = true;
                }
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
                // Check for improper spacing between numbers and units (SI standard)
                validate_unit_spacing(&item.text, category)?;
                // Check for unicode fractions (should use text fractions like 1/2 instead)
                validate_no_unicode_fractions(&item.text, category)?;
            }
        }
        for (idx, step) in steps.iter().enumerate() {
            if step.trim().is_empty() {
                bail!("Empty instruction step found at position {}", idx + 1);
            }
        }

        // Check for unreferenced ingredients
        let all_steps_text = steps.join(" ").to_lowercase();
        let step_refs = extract_step_refs(&all_steps_text);
        let unreferenced_ingredients = find_unreferenced_ingredients(&ingredients, &step_refs);

        // Print warnings for unreferenced ingredients (non-blocking)
        if !unreferenced_ingredients.is_empty() {
            eprintln!("\n⚠️  WARNING: The following ingredients are not linked in any instruction step:");
            for ingredient in &unreferenced_ingredients {
                eprintln!("   - {}", ingredient);
            }
            eprintln!("   Consider adding {{ingredient}} references in your steps for better UX.\n");
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
        author: frontmatter.author,
        date: frontmatter.date,
        notes,
        ingredients,
        steps,
        serving_suggestions,
    })
}

fn validate_unit_spacing(text: &str, category: &str) -> Result<()> {
    // Check for numbers directly followed by metric units without space
    // Matches patterns like: 500g, 200ml, 1.5kg, 25l
    let metric_units = ["g", "kg", "ml", "l"];
    let words: Vec<&str> = text.split_whitespace().collect();

    for word in words {
        // Remove trailing punctuation and parentheses for checking
        let cleaned = word.trim_end_matches(|c: char| !c.is_alphanumeric());

        // Check if word contains a digit followed immediately by a metric unit
        for unit in &metric_units {
            // Look for patterns like "500g" or "1.5kg" (number directly followed by unit)
            if cleaned.ends_with(unit) && cleaned.len() > unit.len() {
                let before_unit = &cleaned[..cleaned.len() - unit.len()];
                // Check if the character right before the unit is a digit
                if let Some(last_char) = before_unit.chars().last() {
                    if last_char.is_ascii_digit() {
                        // Check if the whole prefix is a valid number (including decimals)
                        let is_number = before_unit.chars().all(|c| c.is_ascii_digit() || c == '.');
                        if is_number {
                            bail!(
                                "Improper unit spacing in '{}' (category '{}'): '{}' should be '{} {}'. \
                                Per UK/SI standards, there must be a space between the number and unit.",
                                text, category, cleaned, before_unit, unit
                            );
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

fn validate_no_unicode_fractions(text: &str, category: &str) -> Result<()> {
    for c in text.chars() {
        if unicode_fraction_value(c).is_some() {
            bail!(
                "Unicode fraction '{}' in '{}' (category '{}'). Use text fractions instead (e.g., 1/2 not ½).",
                c, text, category
            );
        }
    }
    Ok(())
}

fn friendly_frontmatter_error(err: &serde_yaml::Error) -> anyhow::Error {
    let msg = err.to_string();

    // Missing required field: "missing field `name`"
    if let Some(field) = msg.strip_prefix("missing field `").and_then(|s| s.strip_suffix('`')) {
        let hint = match field {
            "id" => "Add a line like: id: my-recipe-name",
            "name" => "Add a line like: name: My Recipe Name",
            "description" => "Add a line like: description: A short description of your recipe",
            "servings" => "Add a line like: servings: 4",
            "time" => "Add a line like: time: 30 (total minutes)",
            "difficulty" => "Add a line like: difficulty: easy (easy, medium, or hard)",
            "tags" => "Add a line like: tags: [pasta, italian, dinner]",
            "date" => "Add a line like: date: 2026-01-15",
            _ => "",
        };
        return if hint.is_empty() {
            anyhow::anyhow!("Missing required field: '{}'\nMake sure your recipe header includes this field.", field)
        } else {
            anyhow::anyhow!("Missing required field: '{}'\n  {}", field, hint)
        };
    }

    // Wrong type: "tags: invalid type: string \"dinner\", expected a sequence"
    if msg.contains("invalid type") {
        if msg.contains("expected a sequence") {
            return anyhow::anyhow!("'tags' should be a list, not a single value.\n  Use square brackets: tags: [dinner, pasta]");
        }
        if msg.contains("expected u32") || msg.contains("expected an integer") {
            let field = if msg.contains("servings") || msg.starts_with("servings") {
                "servings"
            } else if msg.contains("time") || msg.starts_with("time") {
                "time"
            } else {
                "servings/time"
            };
            return anyhow::anyhow!("'{}' should be a number without quotes.\n  Example: {}: 4", field, field);
        }
    }

    // Unknown field
    if msg.contains("unknown field") {
        if let Some(rest) = msg.strip_prefix("unknown field `") {
            if let Some(field) = rest.split('`').next() {
                return anyhow::anyhow!(
                    "Unknown field: '{}'\n  Check for typos. Required fields: id, name, description, servings, time, difficulty, tags, date",
                    field
                );
            }
        }
    }

    // YAML syntax errors — the really cryptic ones
    if msg.contains("mapping values are not allowed") || msg.contains("did not find expected")
        || msg.contains("found unexpected") || msg.contains("block sequence")
        || msg.contains("could not find expected")
    {
        return anyhow::anyhow!(
            "There's a formatting error in the recipe header.\n  \
            Make sure each field is on its own line as 'key: value' (with a space after the colon).\n  \
            Check for missing colons, extra spaces at the start of lines, or unclosed brackets.\n  \
            YAML detail: {}", msg
        );
    }

    // Fallback
    anyhow::anyhow!("Could not read the recipe header: {}", msg)
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
        bail!("Recipe ID can only contain lowercase letters and dashes: '{}'\n  Example: thai-green-curry", fm.id);
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
        bail!("Difficulty '{}' is not valid. Use one of: easy, medium, or hard", fm.difficulty);
    }

    // Validate numeric fields
    if fm.servings == 0 {
        bail!("Servings must be greater than 0");
    }
    if fm.time == 0 {
        bail!("Time must be greater than 0");
    }

    // Validate optional fields (always, not just lint mode)
    if let Some(ref author) = fm.author {
        if author.is_empty() || author.len() > 100 {
            bail!("Author must be 1–100 characters, got {}", author.len());
        }
    }
    let valid_date = fm.date.len() == 10
        && fm.date.chars().enumerate().all(|(i, c)| match i {
            4 | 7 => c == '-',
            _ => c.is_ascii_digit(),
        });
    if !valid_date {
        bail!("Date must be in YYYY-MM-DD format, got '{}'", fm.date);
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

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn generate_og_html(recipe: &Recipe) -> String {
    let name = escape_html(&recipe.name);
    let description = escape_html(&recipe.description);
    let id = &recipe.id;
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{description}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="BiteMe">
  <meta property="og:title" content="{name} — BiteMe">
  <meta property="og:description" content="{description}">
  <meta property="og:image" content="https://biteme.ovh/assets/icons/icon-512.png">
  <meta property="og:url" content="https://biteme.ovh/r/{id}.html">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{name} — BiteMe">
  <meta name="twitter:description" content="{description}">
  <meta name="twitter:image" content="https://biteme.ovh/assets/icons/icon-512.png">
  <title>{name} — BiteMe</title>
</head>
<body>
  <p>{name} — {description}</p>
  <script>window.location.replace('/recipe.html?id={id}');</script>
</body>
</html>
"#
    )
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
                    eprintln!("  ❌ Error in {:?}:\n  {}", path.file_name().unwrap_or_default(), e);
                    if cli.lint {
                        std::process::exit(1);
                    }
                }
            }
        }
    }

    if recipes.is_empty() {
        bail!("No valid recipes found in {:?}", cli.input);
    }

    // Sort by date descending (newest first)
    recipes.sort_by(|a, b| b.date.cmp(&a.date));

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
        recipe_count: recipes.len(),
    };

    // Write manifest.json next to recipes.json
    let manifest_path = cli.output.with_file_name("recipes-manifest.json");
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .context("Failed to serialize manifest")?;

    fs::write(&manifest_path, manifest_json)
        .with_context(|| format!("Failed to write manifest file: {:?}", manifest_path))?;

    println!("📦 Manifest written to: {:?}", manifest_path);

    // Generate per-recipe OG HTML files
    let og_dir = cli.output.parent().unwrap_or_else(|| std::path::Path::new(".")).join("r");
    fs::create_dir_all(&og_dir)
        .with_context(|| format!("Failed to create OG directory: {:?}", og_dir))?;

    for recipe in &recipes {
        let og_path = og_dir.join(format!("{}.html", recipe.id));
        fs::write(&og_path, generate_og_html(recipe))
            .with_context(|| format!("Failed to write OG file: {:?}", og_path))?;
    }

    println!("🔗 Generated {} OG HTML file(s) in {:?}", recipes.len(), og_dir);

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
date: 2026-01-01
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
date: 2026-01-01
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
        assert!(result.unwrap_err().to_string().contains("is not valid. Use one of: easy, medium, or hard"));
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
        assert!(result.unwrap_err().to_string().contains("can only contain lowercase letters and dashes"));
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
date: 2026-01-01
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
        assert!(result.unwrap_err().to_string().contains("can only contain lowercase letters and dashes"));
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
    fn test_lint_detects_unreferenced_ingredients() {
        let test_recipe = r#"---
id: lint-test
name: Lint Test
description: Test unreferenced ingredient detection
servings: 2
time: 10
difficulty: easy
tags: [test]
date: 2026-01-01
---

# Ingredients

## Pantry
- 1 cup flour
- 2 tbsp oil
- 1 tsp salt

# Instructions

1. Mix {flour} and {salt}
2. Done
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("lint-test.md");
        fs::write(&test_file, test_recipe).unwrap();

        // This should not error in lint mode but should print warning about unreferenced oil
        let result = parse_recipe_file(&test_file, true);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        // Oil is not referenced, so it should trigger a warning (but not fail)
    }

    #[test]
    fn test_ingredient_links_preserved_in_steps() {
        let test_recipe = r#"---
id: ingredient-links-test
name: Ingredient Links Test
description: Test that ingredient links are preserved in steps
servings: 2
time: 15
difficulty: easy
tags: [test]
date: 2026-01-01
---

# Ingredients

## Pantry
- 1 cup rice
- 2 tbsp oil

## Fresh
- 1 onion, diced

# Instructions

1. Heat {oil} in a pot
2. Add {onion} and cook until soft
3. Add {rice} and {water}
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("ingredient-links-test.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();

        // Check that ingredient links are preserved with curly braces
        assert_eq!(recipe.steps.len(), 3);
        assert!(recipe.steps[0].contains("{oil}"), "Step 1 should contain {{oil}}");
        assert!(recipe.steps[1].contains("{onion}"), "Step 2 should contain {{onion}}");
        assert!(recipe.steps[2].contains("{rice}"), "Step 3 should contain {{rice}}");
        assert!(recipe.steps[2].contains("{water}"), "Step 3 should contain {{water}}");
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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
date: 2026-01-01
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

    #[test]
    fn test_recipe_with_author_and_date() {
        let test_recipe = r#"---
id: author-date-test
name: Author Date Test
description: Recipe with author and date fields
servings: 2
time: 15
difficulty: easy
tags: [test]
author: James
date: 2026-02-10
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("author-date-test.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();
        assert_eq!(recipe.author, Some("James".to_string()));
        assert_eq!(recipe.date, "2026-02-10");
    }

    #[test]
    fn test_invalid_date_format() {
        let test_recipe = r#"---
id: bad-date
name: Bad Date Test
description: Recipe with invalid date format
servings: 2
time: 15
difficulty: easy
tags: [test]
date: 10-02-2026
---

# Ingredients

## Pantry
- 1 cup ingredient

# Instructions

1. Step one
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("bad-date.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("YYYY-MM-DD"));
    }

    // ── Quantity parsing tests ──

    #[test]
    fn test_quantity_simple_metric() {
        let q = parse_ingredient_quantity("500 g mixed mushrooms, sliced").unwrap();
        assert_eq!(q.amount, 500.0);
        assert_eq!(q.unit.as_deref(), Some("g"));
        assert_eq!(q.item, "mixed mushrooms, sliced");
        assert!(q.amount_max.is_none());
        assert!(q.prefix.is_none());
    }

    #[test]
    fn test_quantity_volume() {
        let q = parse_ingredient_quantity("2 tbsp olive oil").unwrap();
        assert_eq!(q.amount, 2.0);
        assert_eq!(q.unit.as_deref(), Some("tbsp"));
        assert_eq!(q.item, "olive oil");
    }

    #[test]
    fn test_quantity_unicode_fraction() {
        let q = parse_ingredient_quantity("½ tsp salt").unwrap();
        assert_eq!(q.amount, 0.5);
        assert_eq!(q.unit.as_deref(), Some("tsp"));
        assert_eq!(q.item, "salt");
    }

    #[test]
    fn test_quantity_text_fraction() {
        let q = parse_ingredient_quantity("1/2 tsp black pepper").unwrap();
        assert_eq!(q.amount, 0.5);
        assert_eq!(q.unit.as_deref(), Some("tsp"));
        assert_eq!(q.item, "black pepper");
    }

    #[test]
    fn test_quantity_range() {
        let q = parse_ingredient_quantity("3-4 cloves garlic, minced").unwrap();
        assert_eq!(q.amount, 3.0);
        assert_eq!(q.amount_max, Some(4.0));
        assert_eq!(q.unit.as_deref(), Some("cloves"));
        assert_eq!(q.item, "garlic, minced");
    }

    #[test]
    fn test_quantity_composite_tin() {
        let q = parse_ingredient_quantity("1 tin (400 ml) coconut milk").unwrap();
        assert_eq!(q.amount, 1.0);
        assert_eq!(q.unit.as_deref(), Some("tin"));
        assert_eq!(q.secondary_amount, Some(400.0));
        assert_eq!(q.secondary_unit.as_deref(), Some("ml"));
        assert_eq!(q.item, "coconut milk");
    }

    #[test]
    fn test_quantity_metric_imperial() {
        let q = parse_ingredient_quantity("250 ml (1 cup) milk").unwrap();
        assert_eq!(q.amount, 250.0);
        assert_eq!(q.unit.as_deref(), Some("ml"));
        assert_eq!(q.secondary_amount, Some(1.0));
        assert_eq!(q.secondary_unit.as_deref(), Some("cup"));
        assert_eq!(q.item, "milk");
    }

    #[test]
    fn test_quantity_about_secondary() {
        let q = parse_ingredient_quantity("1 medium floury potato (about 150 g), peeled and cubed").unwrap();
        assert_eq!(q.amount, 1.0);
        assert_eq!(q.unit.as_deref(), Some("medium"));
        assert_eq!(q.secondary_amount, Some(150.0));
        assert_eq!(q.secondary_unit.as_deref(), Some("g"));
        assert_eq!(q.secondary_prefix.as_deref(), Some("about"));
        assert_eq!(q.item, "floury potato, peeled and cubed");
    }

    #[test]
    fn test_quantity_prefix_juice_of() {
        let q = parse_ingredient_quantity("Juice of 1/2 lemon (optional)").unwrap();
        assert_eq!(q.prefix.as_deref(), Some("Juice of"));
        assert_eq!(q.amount, 0.5);
        assert!(q.unit.is_none());
        assert_eq!(q.item, "lemon (optional)");
    }

    #[test]
    fn test_quantity_count_based() {
        let q = parse_ingredient_quantity("4 medium ripe bananas, mashed").unwrap();
        assert_eq!(q.amount, 4.0);
        assert_eq!(q.unit.as_deref(), Some("medium"));
        assert_eq!(q.item, "ripe bananas, mashed");
    }

    #[test]
    fn test_quantity_mixed_number() {
        let q = parse_ingredient_quantity("250 g (1-3/4 cups) flour").unwrap();
        assert_eq!(q.amount, 250.0);
        assert_eq!(q.unit.as_deref(), Some("g"));
        assert_eq!(q.secondary_amount, Some(1.75));
        assert_eq!(q.secondary_unit.as_deref(), Some("cups"));
        assert_eq!(q.item, "flour");
    }

    #[test]
    fn test_quantity_fraction_secondary() {
        let q = parse_ingredient_quantity("125 g (3/4 cup) brown sugar").unwrap();
        assert_eq!(q.amount, 125.0);
        assert_eq!(q.unit.as_deref(), Some("g"));
        assert_eq!(q.secondary_amount, Some(0.75));
        assert_eq!(q.secondary_unit.as_deref(), Some("cup"));
        assert_eq!(q.item, "brown sugar");
    }

    #[test]
    fn test_quantity_no_unit() {
        let q = parse_ingredient_quantity("1 onion, diced").unwrap();
        assert_eq!(q.amount, 1.0);
        assert!(q.unit.is_none());
        assert_eq!(q.item, "onion, diced");
    }

    #[test]
    fn test_quantity_parenthetical_not_secondary() {
        let q = parse_ingredient_quantity("3 tsp baking soda (Natron)").unwrap();
        assert_eq!(q.amount, 3.0);
        assert_eq!(q.unit.as_deref(), Some("tsp"));
        assert_eq!(q.item, "baking soda (Natron)");
        assert!(q.secondary_amount.is_none());
    }

    #[test]
    fn test_quantity_non_scalable_salt() {
        assert!(parse_ingredient_quantity("Salt to taste").is_none());
    }

    #[test]
    fn test_quantity_non_scalable_pinch() {
        assert!(parse_ingredient_quantity("Pinch of salt").is_none());
    }

    #[test]
    fn test_quantity_non_scalable_fresh() {
        assert!(parse_ingredient_quantity("Fresh parsley for garnish").is_none());
    }

    #[test]
    fn test_quantity_non_scalable_ice_cubes() {
        assert!(parse_ingredient_quantity("Ice cubes (about 25 g)").is_none());
    }

    #[test]
    fn test_quantity_non_scalable_extra() {
        assert!(parse_ingredient_quantity("Extra banana slices for topping").is_none());
    }

    #[test]
    fn test_quantity_non_scalable_good_quality() {
        assert!(parse_ingredient_quantity("Good quality olive oil (for serving)").is_none());
    }

    #[test]
    fn test_quantity_non_scalable_optional() {
        assert!(parse_ingredient_quantity("Optional: pinch of cumin, paprika, sumac, or za'atar").is_none());
    }

    #[test]
    fn test_quantity_non_scalable_thumb_sized() {
        assert!(parse_ingredient_quantity("Thumb-sized piece of ginger, grated").is_none());
    }

    #[test]
    fn test_quantity_non_scalable_little() {
        assert!(parse_ingredient_quantity("A little extra plant milk for glazing").is_none());
    }

    #[test]
    fn test_no_scale_annotation_in_recipe() {
        let test_recipe = r#"---
id: no-scale-test
name: No Scale Test
description: Test no-scale annotation handling
servings: 2
time: 15
difficulty: easy
tags: [test]
date: 2026-01-01
---

# Ingredients

## Pantry
- 1 large handful of spinach <!-- no-scale -->
- 500 g flour

# Instructions

1. Mix {flour} and {spinach}
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("no-scale-test.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();
        let pantry = recipe.ingredients.get("Pantry").unwrap();

        // First ingredient has no-scale annotation: quantity should be None
        assert!(pantry[0].quantity.is_none());
        // Text should not contain the annotation
        assert!(!pantry[0].text.contains("no-scale"));

        // Second ingredient should have quantity parsed
        assert!(pantry[1].quantity.is_some());
        assert_eq!(pantry[1].quantity.as_ref().unwrap().amount, 500.0);
    }

    #[test]
    fn test_quantity_in_parsed_recipe() {
        let test_recipe = r#"---
id: quantity-test
name: Quantity Test
description: Test quantity parsing in full recipe
servings: 4
time: 30
difficulty: easy
tags: [test]
date: 2026-01-01
---

# Ingredients

## Fresh
- 3-4 cloves garlic, minced
- Juice of 1/2 lemon

## Pantry
- 1 tin (400 ml) coconut milk
- Salt to taste

# Instructions

1. Use {garlic}, {lemon}, {coconut milk}, and {salt}
"#;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("quantity-test.md");
        fs::write(&test_file, test_recipe).unwrap();

        let result = parse_recipe_file(&test_file, false);
        fs::remove_file(&test_file).ok();

        assert!(result.is_ok());
        let recipe = result.unwrap();

        let fresh = recipe.ingredients.get("Fresh").unwrap();
        // 3-4 cloves garlic
        let garlic = &fresh[0];
        let gq = garlic.quantity.as_ref().unwrap();
        assert_eq!(gq.amount, 3.0);
        assert_eq!(gq.amount_max, Some(4.0));
        assert_eq!(gq.unit.as_deref(), Some("cloves"));

        // Juice of 1/2 lemon
        let lemon = &fresh[1];
        let lq = lemon.quantity.as_ref().unwrap();
        assert_eq!(lq.prefix.as_deref(), Some("Juice of"));
        assert_eq!(lq.amount, 0.5);

        let pantry = recipe.ingredients.get("Pantry").unwrap();
        // 1 tin (400 ml) coconut milk
        let coconut = &pantry[0];
        let cq = coconut.quantity.as_ref().unwrap();
        assert_eq!(cq.amount, 1.0);
        assert_eq!(cq.unit.as_deref(), Some("tin"));
        assert_eq!(cq.secondary_amount, Some(400.0));

        // Salt to taste — non-scalable
        assert!(pantry[1].quantity.is_none());
    }

    #[test]
    fn test_parse_amount_helper() {
        // Integer
        assert_eq!(parse_amount("500 g").map(|(v, _)| v), Some(500.0));
        // Decimal
        assert_eq!(parse_amount("1.5 tsp").map(|(v, _)| v), Some(1.5));
        // Unicode fraction
        assert_eq!(parse_amount("½ tsp").map(|(v, _)| v), Some(0.5));
        // Text fraction
        assert_eq!(parse_amount("3/4 cup").map(|(v, _)| v), Some(0.75));
        // Mixed with dash
        assert_eq!(parse_amount("1-3/4 cups").map(|(v, _)| v), Some(1.75));
        // Non-number
        assert!(parse_amount("Salt").is_none());
    }

    #[test]
    fn test_extract_step_refs() {
        let text = "heat {oil} then add {garlic} and {lemon} juice";
        let refs = extract_step_refs(text);
        assert_eq!(refs, vec!["oil", "garlic", "lemon"]);
    }

    #[test]
    fn test_extract_step_refs_multi_word() {
        let text = "add {ice cubes} and {bicarbonate of soda}";
        let refs = extract_step_refs(text);
        assert_eq!(refs, vec!["ice cubes", "bicarbonate of soda"]);
    }

    #[test]
    fn test_extract_step_refs_empty_braces() {
        let text = "nothing {} here {valid}";
        let refs = extract_step_refs(text);
        assert_eq!(refs, vec!["valid"]);
    }

    #[test]
    fn test_unreferenced_matches_substring() {
        let mut ingredients = HashMap::new();
        ingredients.insert("Fresh".to_string(), vec![
            Ingredient { id: 1, text: "Few ice cubes".to_string(), quantity: None },
            Ingredient { id: 2, text: "Juice of 1 lemon".to_string(), quantity: None },
            Ingredient { id: 3, text: "2 tbsp olive oil".to_string(), quantity: None },
        ]);
        let refs = vec!["ice cubes".to_string(), "lemon".to_string()];
        let unreferenced = find_unreferenced_ingredients(&ingredients, &refs);
        assert_eq!(unreferenced, vec!["2 tbsp olive oil (Fresh)"]);
    }

    #[test]
    fn test_unreferenced_all_matched() {
        let mut ingredients = HashMap::new();
        ingredients.insert("Pantry".to_string(), vec![
            Ingredient { id: 1, text: "250 g dried chickpeas".to_string(), quantity: None },
            Ingredient { id: 2, text: "120 g tahini".to_string(), quantity: None },
        ]);
        let refs = vec!["chickpeas".to_string(), "tahini".to_string()];
        let unreferenced = find_unreferenced_ingredients(&ingredients, &refs);
        assert!(unreferenced.is_empty());
    }

    #[test]
    fn test_unreferenced_none_matched() {
        let mut ingredients = HashMap::new();
        ingredients.insert("Spices".to_string(), vec![
            Ingredient { id: 1, text: "Salt to taste".to_string(), quantity: None },
        ]);
        let refs = vec!["oil".to_string()];
        let unreferenced = find_unreferenced_ingredients(&ingredients, &refs);
        assert_eq!(unreferenced, vec!["Salt to taste (Spices)"]);
    }
}
