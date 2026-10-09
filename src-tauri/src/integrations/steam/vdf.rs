use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum VdfValue {
    String(String),
    Section(VdfSection),
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct VdfSection {
    pub entries: Vec<(String, VdfValue)>,
}

impl VdfSection {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    /// Case-insensitive key lookup
    pub fn get(&self, key: &str) -> Option<&VdfValue> {
        self.entries
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v)
    }

    /// Retrieve value as string slice if it exists and is a String
    pub fn get_str(&self, key: &str) -> Option<&str> {
        match self.get(key) {
            Some(VdfValue::String(s)) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Retrieve value as VdfSection if it exists and is a Section
    pub fn get_section(&self, key: &str) -> Option<&VdfSection> {
        match self.get(key) {
            Some(VdfValue::Section(s)) => Some(s),
            _ => None,
        }
    }

    /// Get all sub-sections as key, section pairs
    pub fn sections(&self) -> Vec<(&str, &VdfSection)> {
        self.entries
            .iter()
            .filter_map(|(k, v)| match v {
                VdfValue::Section(s) => Some((k.as_str(), s)),
                _ => None,
            })
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct VdfParseError {
    pub line: usize,
    pub col: usize,
    pub message: String,
}

impl fmt::Display for VdfParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "VDF parse error at line {}, col {}: {}",
            self.line, self.col, self.message
        )
    }
}

impl std::error::Error for VdfParseError {}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    String(String),
    OpenBrace,
    CloseBrace,
}

struct Tokenizer<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
    line: usize,
    col: usize,
}

impl<'a> Tokenizer<'a> {
    fn new(input: &'a str) -> Self {
        Self {
            chars: input.chars().peekable(),
            line: 1,
            col: 1,
        }
    }

    fn next_char(&mut self) -> Option<char> {
        let ch = self.chars.next()?;
        if ch == '\n' {
            self.line += 1;
            self.col = 1;
        } else {
            self.col += 1;
        }
        Some(ch)
    }

    fn peek_char(&mut self) -> Option<char> {
        self.chars.peek().copied()
    }

    fn skip_whitespace_and_comments(&mut self) {
        loop {
            while let Some(ch) = self.peek_char() {
                if ch.is_whitespace() {
                    self.next_char();
                } else {
                    break;
                }
            }

            // Check for line comment //
            if self.peek_char() == Some('/') {
                let mut clone = self.chars.clone();
                clone.next();
                if clone.peek() == Some(&'/') {
                    // Skip comment line
                    self.next_char(); // first /
                    self.next_char(); // second /
                    while let Some(ch) = self.next_char() {
                        if ch == '\n' {
                            break;
                        }
                    }
                    continue;
                }
            }
            break;
        }
    }

    fn next_token(&mut self) -> Result<Option<(Token, usize, usize)>, VdfParseError> {
        self.skip_whitespace_and_comments();

        let ch = match self.peek_char() {
            Some(c) => c,
            None => return Ok(None),
        };

        let start_line = self.line;
        let start_col = self.col;

        if ch == '{' {
            self.next_char();
            return Ok(Some((Token::OpenBrace, start_line, start_col)));
        }

        if ch == '}' {
            self.next_char();
            return Ok(Some((Token::CloseBrace, start_line, start_col)));
        }

        if ch == '"' {
            self.next_char(); // consume opening quote
            let mut s = String::new();
            while let Some(c) = self.next_char() {
                if c == '"' {
                    return Ok(Some((Token::String(s), start_line, start_col)));
                } else if c == '\\' {
                    if let Some(escaped) = self.next_char() {
                        match escaped {
                            'n' => s.push('\n'),
                            't' => s.push('\t'),
                            'r' => s.push('\r'),
                            '"' => s.push('"'),
                            '\\' => s.push('\\'),
                            other => {
                                // Keep backslash if not special, e.g. Windows path
                                s.push('\\');
                                s.push(other);
                            }
                        }
                    } else {
                        return Err(VdfParseError {
                            line: start_line,
                            col: start_col,
                            message: "Unexpected end of input after escape backslash".to_string(),
                        });
                    }
                } else {
                    s.push(c);
                }
            }
            return Err(VdfParseError {
                line: start_line,
                col: start_col,
                message: "Unterminated quoted string".to_string(),
            });
        }

        // Unquoted token (alphanumeric, symbols until whitespace or brace)
        let mut unquoted = String::new();
        while let Some(c) = self.peek_char() {
            if c.is_whitespace() || c == '{' || c == '}' || c == '"' {
                break;
            }
            unquoted.push(c);
            self.next_char();
        }

        if !unquoted.is_empty() {
            Ok(Some((Token::String(unquoted), start_line, start_col)))
        } else {
            Err(VdfParseError {
                line: start_line,
                col: start_col,
                message: format!("Unexpected character: {:?}", ch),
            })
        }
    }
}

pub struct VdfParser;

impl VdfParser {
    pub fn parse(input: &str) -> Result<VdfSection, VdfParseError> {
        let mut tokenizer = Tokenizer::new(input);
        let mut tokens = Vec::new();
        while let Some(tok) = tokenizer.next_token()? {
            tokens.push(tok);
        }

        let mut idx = 0;
        let mut root = VdfSection::new();

        while idx < tokens.len() {
            let (key, val) = Self::parse_entry(&tokens, &mut idx)?;
            root.entries.push((key, val));
        }

        Ok(root)
    }

    fn parse_entry(
        tokens: &[(Token, usize, usize)],
        idx: &mut usize,
    ) -> Result<(String, VdfValue), VdfParseError> {
        if *idx >= tokens.len() {
            return Err(VdfParseError {
                line: 0,
                col: 0,
                message: "Unexpected end of tokens".to_string(),
            });
        }

        let key = match &tokens[*idx].0 {
            Token::String(k) => k.clone(),
            other => {
                let (_, l, c) = tokens[*idx];
                return Err(VdfParseError {
                    line: l,
                    col: c,
                    message: format!("Expected key string, found {:?}", other),
                });
            }
        };
        *idx += 1;

        if *idx >= tokens.len() {
            return Err(VdfParseError {
                line: 0,
                col: 0,
                message: format!("Expected value or section for key '{}', found EOF", key),
            });
        }

        match &tokens[*idx].0 {
            Token::String(s) => {
                let val = VdfValue::String(s.clone());
                *idx += 1;
                Ok((key, val))
            }
            Token::OpenBrace => {
                *idx += 1; // consume '{'
                let mut section = VdfSection::new();
                while *idx < tokens.len() {
                    if matches!(&tokens[*idx].0, Token::CloseBrace) {
                        *idx += 1; // consume '}'
                        return Ok((key, VdfValue::Section(section)));
                    }
                    let (sub_key, sub_val) = Self::parse_entry(tokens, idx)?;
                    section.entries.push((sub_key, sub_val));
                }
                Err(VdfParseError {
                    line: 0,
                    col: 0,
                    message: format!("Unclosed section for key '{}'", key),
                })
            }
            Token::CloseBrace => {
                let (_, l, c) = tokens[*idx];
                Err(VdfParseError {
                    line: l,
                    col: c,
                    message: format!("Unexpected '}}' as value for key '{}'", key),
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_key_values() {
        let input = r#"
            "appid" "105600"
            "name" "Terraria"
            "StateFlags" "4"
        "#;
        let root = VdfParser::parse(input).unwrap();
        assert_eq!(root.get_str("appid"), Some("105600"));
        assert_eq!(root.get_str("name"), Some("Terraria"));
        assert_eq!(root.get_str("StateFlags"), Some("4"));
        // Case-insensitivity
        assert_eq!(root.get_str("APPID"), Some("105600"));
        assert_eq!(root.get_str("stateflags"), Some("4"));
    }

    #[test]
    fn test_parse_nested_sections() {
        let input = r#"
            "AppState"
            {
                "appid" "105600"
                "name" "Terraria"
                "UserConfig"
                {
                    "language" "english"
                }
            }
        "#;
        let root = VdfParser::parse(input).unwrap();
        let app_state = root.get_section("AppState").unwrap();
        assert_eq!(app_state.get_str("appid"), Some("105600"));
        let user_config = app_state.get_section("UserConfig").unwrap();
        assert_eq!(user_config.get_str("language"), Some("english"));
    }

    #[test]
    fn test_parse_escaped_windows_paths_and_quotes() {
        let input = r#"
            "path" "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Terraria"
            "quote_test" "He said \"hello world\""
        "#;
        let root = VdfParser::parse(input).unwrap();
        assert_eq!(
            root.get_str("path"),
            Some("C:\\Program Files (x86)\\Steam\\steamapps\\common\\Terraria")
        );
        assert_eq!(root.get_str("quote_test"), Some("He said \"hello world\""));
    }

    #[test]
    fn test_parse_with_comments_and_whitespace() {
        let input = r#"
            // This is a comment at top
            "libraryfolders"
            {
                // Comment inside section
                "0"
                {
                    "path" "C:\\Steam" // Trailing comment
                    "totalsize" "0"
                }
            }
        "#;
        let root = VdfParser::parse(input).unwrap();
        let lib = root.get_section("libraryfolders").unwrap();
        let folder0 = lib.get_section("0").unwrap();
        assert_eq!(folder0.get_str("path"), Some("C:\\Steam"));
    }

    #[test]
    fn test_parse_malformed_unclosed_string() {
        let input = r#"
            "name" "Terraria
        "#;
        let res = VdfParser::parse(input);
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("Unterminated quoted string"));
    }

    #[test]
    fn test_parse_malformed_unclosed_section() {
        let input = r#"
            "AppState"
            {
                "appid" "105600"
        "#;
        let res = VdfParser::parse(input);
        assert!(res.is_err());
        assert!(res.unwrap_err().to_string().contains("Unclosed section"));
    }
}
