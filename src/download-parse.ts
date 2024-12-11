import { promises as fs } from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import stripJsonComments from 'strip-json-comments';
import { Schema, NamespaceSchema } from './types.js';

export class DownloadParse {
  private _tag!: string;
  private tagDir!: string;
  private readonly mozRepo = 'mozilla-unified';
  private readonly mozArchiveURL =
    'https://hg.mozilla.org/mozilla-unified/archive';
  private readonly mozLatestFxURL =
    'https://download.mozilla.org/?product=firefox-latest&os=linux64&lang=en-US';
  private readonly outDir = path.join(__dirname, '..', '.schemas');
  private readonly schemaTypes = ['browser', 'toolkit'];
  private readonly schemasDir = ['components', 'extensions', 'schemas'];
  private readonly schemas: Schema = {
    raw: {},
    namespaces: {},
  };

  constructor({ tag }: { tag?: string } = {}) {
    if (tag) {
      this.tag = tag;
    }
  }

  set tag(tag: string) {
    this._tag = tag;
    this.tagDir = path.join(this.outDir, `${this.mozRepo}-${tag}`);
  }

  get tag(): string {
    return this._tag;
  }

  async run(): Promise<this> {
    if (!this.tag) {
      await this.fetchLatestStableTag();
    }
    if (!(await this.tagDirExists())) {
      await this.downloadSchemas();
    }

    await this.parseSchemas();
    this.extractNamespaces();

    return this;
  }

  getSchemas(): Schema {
    return this.schemas;
  }

  getTag(): string {
    return this.tag;
  }

  private extractNamespaces(): void {
    for (const schemaJson of Object.values(this.schemas.raw)) {
      for (const namespace of schemaJson) {
        if (!this.schemas.namespaces[namespace.namespace]) {
          this.schemas.namespaces[namespace.namespace] = [];
        }
        this.schemas.namespaces[namespace.namespace].push(namespace);
      }
    }
  }

  private async parseSchemas(): Promise<void> {
    const unordered: {
      [key: string]: NamespaceSchema[];
    } = {};
    await Promise.all(
      this.schemaTypes.map(async (type) => {
        const dir = path.join(this.tagDir, type, ...this.schemasDir);
        const files = await fs.readdir(dir);

        await Promise.all(
          files.map(async (file) => {
            if (path.extname(file) !== '.json') {
              return;
            }

            const jsonBuffer = await fs.readFile(path.join(dir, file));
            const schema: NamespaceSchema[] = JSON.parse(
              stripJsonComments(jsonBuffer.toString()),
            );
            unordered[file] = schema;
          }),
        );
      }),
    );
    for (const file of Object.keys(unordered)) {
      this.schemas.raw[file] = unordered[file];
    }
  }

  private async downloadSchemas(): Promise<void> {
    await Promise.all(
      this.schemaTypes.map((type: string) => this.downloadSchema(type)),
    );
  }

  private async downloadSchema(type: string): Promise<void> {
    const url = this.getDownloadArchiveUrl(type);
    const res = await fetch(url, {
      method: 'GET',
    });
    if (!res.ok) {
      throw new Error(
        `http status ${res.status} while trying to download ${url} - probably invalid tag name`,
      );
    }
    const data = Buffer.from(await res.arrayBuffer());
    return (await unzipper.Open.buffer(data)).extract({ path: this.outDir });
  }

  private async tagDirExists(): Promise<boolean> {
    try {
      await fs.access(this.tagDir);
      return true;
    } catch (_error) {
      return false;
    }
  }

  private async fetchLatestStableTag(): Promise<void> {
    const res = await fetch(this.mozLatestFxURL, {
      method: 'HEAD',
      redirect: 'manual',
    });
    if (res.status !== 302) {
      throw new Error('should have been redirected - something went wrong');
    }
    const location = res.headers.get('location');
    const [, release] =
      location?.match(/\/pub\/firefox\/releases\/([^/]+)\//) ?? [];
    if (!release) {
      throw new Error("Couldn't automatically resolve latest stable tag");
    }
    this.tag = `FIREFOX_${release.replace(/\./g, '_')}_RELEASE`;
  }

  private getDownloadArchiveUrl(type: string): string {
    return [
      this.mozArchiveURL,
      `${this.tag}.zip`,
      type,
      ...this.schemasDir,
    ].join('/');
  }
}
