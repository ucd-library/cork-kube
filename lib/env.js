import fs from 'fs';
import path from 'path';

/**
 * Class for managing environment files while preserving formatting, comments, and spaces
 */
class EnvFile {
  constructor(filePath) {
    this.filePath = filePath;
    this.lines = [];
    this.variables = new Map();
    this.variableLineMap = new Map(); // Maps variable names to line indices
    
    if (filePath && fs.existsSync(filePath)) {
      this.read();
    }
  }

  /**
   * Read the environment file and parse it
   */
  read() {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    const content = fs.readFileSync(this.filePath, 'utf8');
    this.lines = content.split('\n');
    this.variables.clear();
    this.variableLineMap.clear();

    // Parse each line to extract variables
    this.lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (trimmed === '' || trimmed.startsWith('#')) {
        return;
      }

      // Look for variable assignments
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        this.variables.set(key, value);
        this.variableLineMap.set(key, index);
      }
    });
  }

  /**
   * Get a variable value
   */
  get(key) {
    return this.variables.get(key);
  }

  /**
   * Set a variable value
   */
  set(key, value) {
    const existingLineIndex = this.variableLineMap.get(key);
    
    if (existingLineIndex !== undefined) {
      // Update existing variable
      this.lines[existingLineIndex] = `${key}=${value}`;
      this.variables.set(key, value);
    } else {
      // Add new variable (will be added at the end by default)
      this.add(key, value);
    }
  }

  /**
   * Add a new environment variable
   * @param {string} key - Variable name
   * @param {string} value - Variable value
   * @param {number} [insertAt] - Optional line index to insert at, otherwise appends to end
   */
  add(key, value, insertAt) {
    const newLine = `${key}=${value}`;
    
    if (insertAt !== undefined && insertAt >= 0 && insertAt <= this.lines.length) {
      // Insert at specific position
      this.lines.splice(insertAt, 0, newLine);
      this.variableLineMap.set(key, insertAt);
      
      // Update line indices for variables that come after the insertion point
      for (const [varName, lineIndex] of this.variableLineMap.entries()) {
        if (lineIndex >= insertAt && varName !== key) {
          this.variableLineMap.set(varName, lineIndex + 1);
        }
      }
    } else {
      // Append to end
      this.lines.push(newLine);
      this.variableLineMap.set(key, this.lines.length - 1);
    }
    
    this.variables.set(key, value);
  }

  /**
   * Remove a variable
   */
  remove(key) {
    const lineIndex = this.variableLineMap.get(key);
    
    if (lineIndex !== undefined) {
      this.lines.splice(lineIndex, 1);
      this.variables.delete(key);
      this.variableLineMap.delete(key);
      
      // Update line indices for variables that come after the removed line
      for (const [varName, varLineIndex] of this.variableLineMap.entries()) {
        if (varLineIndex > lineIndex) {
          this.variableLineMap.set(varName, varLineIndex - 1);
        }
      }
    }
  }

  /**
   * Check if a variable exists
   */
  has(key) {
    return this.variables.has(key);
  }

  /**
   * Get all variable names
   */
  keys() {
    return Array.from(this.variables.keys());
  }

  /**
   * Get all variables as an object
   */
  toObject() {
    const obj = {};
    for (const [key, value] of this.variables) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Get the variables Map (for direct manipulation if needed)
   */
  getVariables() {
    return this.variables;
  }

  /**
   * Write the environment file
   * @param {string} [outputPath] - Optional new path, otherwise uses original path
   */
  write(outputPath) {
    const targetPath = outputPath || this.filePath;
    
    if (!targetPath) {
      throw new Error('No file path specified for writing');
    }

    // Ensure directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Join lines and write to file
    const content = this.lines.join('\n');
    fs.writeFileSync(targetPath, content, 'utf8');
    
    // Update the file path if we wrote to a new location
    if (outputPath) {
      this.filePath = outputPath;
    }
  }

  /**
   * Get the raw lines (useful for debugging or manual manipulation)
   */
  getLines() {
    return [...this.lines];
  }

  /**
   * Add a comment line
   * @param {string} comment - Comment text (without #)
   * @param {number} [insertAt] - Optional line index to insert at, otherwise appends to end
   */
  addComment(comment, insertAt) {
    const commentLine = `# ${comment}`;
    
    if (insertAt !== undefined && insertAt >= 0 && insertAt <= this.lines.length) {
      this.lines.splice(insertAt, 0, commentLine);
      
      // Update line indices for variables that come after the insertion point
      for (const [varName, lineIndex] of this.variableLineMap.entries()) {
        if (lineIndex >= insertAt) {
          this.variableLineMap.set(varName, lineIndex + 1);
        }
      }
    } else {
      this.lines.push(commentLine);
    }
  }

  /**
   * Add an empty line
   * @param {number} [insertAt] - Optional line index to insert at, otherwise appends to end
   */
  addEmptyLine(insertAt) {
    if (insertAt !== undefined && insertAt >= 0 && insertAt <= this.lines.length) {
      this.lines.splice(insertAt, 0, '');
      
      // Update line indices for variables that come after the insertion point
      for (const [varName, lineIndex] of this.variableLineMap.entries()) {
        if (lineIndex >= insertAt) {
          this.variableLineMap.set(varName, lineIndex + 1);
        }
      }
    } else {
      this.lines.push('');
    }
  }
}

export default EnvFile;