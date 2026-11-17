const fs = require('fs');

function transformOrderingScreen(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');

  // Extract combo modal inner
  const comboModalStart = code.indexOf('<Modal\n        visible={showComboCustomizer && !!selectedDish}');
  const comboHeaderEnd = code.indexOf('>', code.indexOf('>', comboModalStart) + 1);
  const comboModalEnd = code.indexOf('</Modal>', comboModalStart);
  const comboInner = code.substring(comboHeaderEnd + 1, comboModalEnd).trim();

  // Extract mod modal inner
  const modModalStart = code.indexOf('<Modal\n        visible={showModifier && !!selectedDish}');
  const modHeaderEnd = code.indexOf('>', code.indexOf('>', modModalStart) + 1);
  const modModalEnd = code.indexOf('</Modal>', modModalStart);
  const modInner = code.substring(modHeaderEnd + 1, modModalEnd).trim();

  // Find contentArea
  const contentAreaStart = code.indexOf('{/* Content Area */}');
  const contentAreaViewEnd = code.indexOf('</View>\n      </View>\n\n      {/* Floating Bottom Cart Bar */}');
  
  const contentAreaNormal = code.substring(code.indexOf('<View style={styles.contentArea}>', contentAreaStart) + '<View style={styles.contentArea}>'.length, contentAreaViewEnd).trim();

  const newContentArea = 
    `{/* Content Area */}\n` +
    `        <View style={styles.contentArea}>\n` +
    `          {showComboCustomizer && !!selectedDish ? (\n` +
    `            ` + comboInner + `\n` +
    `          ) : showModifier && !!selectedDish ? (\n` +
    `            ` + modInner + `\n` +
    `          ) : (\n` +
    `            <>\n` +
    `              ` + contentAreaNormal + `\n` +
    `            </>\n` +
    `          )}\n` +
    `        </View>`;

  // Remove the old combo and mod modals from the bottom of the component
  const comboSectionStart = code.indexOf('{/* ── Combo Customizer Full-Screen Modal ── */}');
  const modSectionEnd = code.indexOf('</Modal>', modModalStart) + '</Modal>'.length;
  
  // Construct the new code
  let newCode = code.substring(0, contentAreaStart) +
                newContentArea +
                code.substring(contentAreaViewEnd + '</View>'.length, comboSectionStart) +
                code.substring(modSectionEnd);

  // Update styles for container to fit inside contentArea seamlessly
  newCode = newCode.replace(
    'comboFullScreenContainer: {\n    flex: 1,\n    backgroundColor: "#ffffff",\n  },',
    'comboFullScreenContainer: {\n    flex: 1,\n    backgroundColor: "#ffffff",\n    borderRadius: 24,\n    overflow: "hidden",\n  },'
  );

  newCode = newCode.replace(
    'comboHeaderBar: {\n    paddingTop: Platform.OS === "android" ? 36 : 48,',
    'comboHeaderBar: {\n    paddingTop: 16,'
  );

  newCode = newCode.replace(
    'customizeFullScreenContainer: {\n    flex: 1,\n    backgroundColor: "#ffffff",\n  },',
    'customizeFullScreenContainer: {\n    flex: 1,\n    backgroundColor: "#ffffff",\n    borderRadius: 24,\n    overflow: "hidden",\n  },'
  );

  newCode = newCode.replace(
    'customizeTopWhiteBar: {\n    backgroundColor: "#ffffff",\n    paddingTop: Platform.OS === "android" ? 36 : 48,',
    'customizeTopWhiteBar: {\n    backgroundColor: "#ffffff",\n    paddingTop: 16,'
  );

  fs.writeFileSync(filePath, newCode, 'utf8');
  console.log('Successfully updated', filePath);
}

transformOrderingScreen('src/Kiosk/app/OrderingScreen.tsx');
transformOrderingScreen('frontend/src/Kiosk/app/OrderingScreen.tsx');

