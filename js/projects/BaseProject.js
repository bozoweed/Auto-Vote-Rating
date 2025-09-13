// BaseProject: abstract base class for all sites.
// Each site class extends this and overrides static methods as needed.

export class BaseProject {
  static domain = '';

  // URLs
  static pageURL(project) { throw new Error('pageURL(project) not implemented'); }
  static voteURL(project) { return this.pageURL(project); }

  // Parsing and naming
  static parseURL(url) { return {}; } // url is an instance of URL
  static projectName(doc, project) { return ''; }

  // Examples and canonical URLs
  static exampleURL() { return ['', '', '']; }         // [prefix, id, suffix]
  static exampleURLGame() { return null; }             // [prefix, game, suffix]
  static exampleURLListing() { return null; }          // [prefix, listing, suffix]
  static exampleURLLang() { return null; }             // [prefix, lang, suffix]
  static URLMain() { return null; }                    // canonical host if different

  // Lists and defaults
  static defaultGame() { return null; }
  static defaultListing() { return null; }
  static defaultLand() { return null; }
  static gameList() { return null; }       // Map
  static listingList() { return null; }    // Map
  static langList() { return null; }       // Map

  // Behaviour/timing/limits
  static timeout(project) { return null; }             // { hour, hours, week, month, minutes, ... }
  static limitedCountVote(project) { return false; }
  static oneProject() { return 0; }                    // 0 = unlimited
  static ordinalWorld(project) { return false; }

  // Flags
  static notRequiredCaptcha(project) { return false; }
  static notRequiredNick(project) { return false; }
  static optionalNick(project) { return false; }
  static notRequiredId(project) { return false; }
  static silentVote(project) { return false; }
  static alertManualCaptcha(project) { return false; }
  static focusedTab(project) { return false; }
  static banAttention(project) { return false; }

  // Validation and dependencies
  static notFound(doc, project) { return false; } // false | true | string
  static needAdditionalOrigins(project) { return []; }
  static needAdditionalPermissions(project) { return []; }
  static needIsTrusted(project) { return false; }
  static needPrompt(project) { return false; }
}