import path from 'path';
import R from 'ramda';
import os from 'os';
import v4 from 'uuid';
import hash from 'object-hash';
import { BitId } from '../bit-id';
import orchestrator, { CapsuleOrchestrator } from '../orchestrator/orchestrator';
import { CapsuleOptions, CreateOptions } from '../orchestrator/types';
import Consumer from '../consumer/consumer';
import BitCapsule from '../capsule/bit-capsule';
import Isolator from './isolator';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import { getComponentLinks } from '../links/link-generator';
import Component from '../consumer/component';

export type Options = {
  newCapsule: boolean;
  name?: string;
};

const DEFAULT_ISOLATION_OPTIONS = {
  baseDir: os.tmpdir(),
  writeDists: true,
  writeBitDependencies: true,
  installPackages: false
};

const DEFAULT_OPTIONS = {
  newCapsule: false,
  name: v4(),
  installPackages: false
};

export default class CapsuleBuilder {
  constructor(private workspace: string, private orch: CapsuleOrchestrator | undefined = orchestrator) {}

  private _buildCapsuleMap(capsules: BitCapsule[]) {
    const capsuleMapping = {};
    R.map(capsules, (capsule: BitCapsule) => (capsuleMapping[capsule.bitId.toString()] = capsule.wrkDir));
    return capsuleMapping;
  }

  async isolateComponents(
    consumer: Consumer,
    bitIds: BitId[],
    capsuleOptions: CapsuleOptions,
    options: Options
  ): Promise<{ [bitId: string]: BitCapsule }> {
    const components = await consumer.loadComponentsForCapsule(bitIds);

    const capsules: BitCapsule[] = await Promise.all(
      R.map((component: Component) => this.createCapsule(component.id, capsuleOptions, options), components)
    );
    const capsuleMapping = this._buildCapsuleMap(capsules);
    await Promise.all(R.map(capsule => this.isolate(consumer, capsule, capsuleOptions, capsuleMapping), capsules));
    if (capsuleOptions.installPackages) await this.installpackages(capsules);
    return capsules.reduce(function(acc, cur) {
      acc[cur.bitId.toString()] = cur;
      return acc;
    }, {});
  }

  async createCapsule(bitId: BitId, capsuleOptions: CapsuleOptions = DEFAULT_OPTIONS, options: Options) {
    if (!this.orch) throw new Error('cant load orch in non consumer env');
    const config = this._generateResourceConfig(bitId, capsuleOptions, options);
    return this.orch.getCapsules(this.workspace, config, options);
  }

  async writeLinkFiles(consumer: Consumer, isolator: Isolator): Promise<void> {
    // const componentWithDependencies = R.head(await consumer.loadComponentsForCapsule([isolator.capsule.bitId]));
    isolator.componentWithDependencies.component.writtenPath = '.';
    const componentLinkFiles: DataToPersist = getComponentLinks({
      consumer,
      component: isolator.componentWithDependencies.component,
      dependencies: isolator.componentWithDependencies.allDependencies,
      bitMap: consumer.bitMap,
      createNpmLinkFiles: true
    });
    await Promise.all(componentLinkFiles.files.map(file => isolator.capsule.outputFile(file.path, file.contents, {})));
  }

  async installpackages(capsules: BitCapsule[]): Promise<void> {
    await Promise.all(capsules.map(capsule => capsule.exec({ command: `npm i`.split(' ') })));
  }

  async isolate(
    consumer: Consumer,
    capsule: BitCapsule,
    capsuleOptions: CapsuleOptions,
    capsuleMap: { [bitId: string]: string }
  ) {
    const isolator: Isolator = await Isolator.getInstance(
      'fs',
      consumer.scope,
      consumer,
      capsule.wrkDir,
      capsule,
      capsuleMap
    );
    await isolator.isolate(
      capsule.bitId,
      Object.assign(
        {},
        DEFAULT_ISOLATION_OPTIONS,
        {
          writeToPath: capsule.wrkDir
        },
        capsuleOptions
      )
    );
    return this.writeLinkFiles(consumer, isolator);
  }

  private _generateWrkDir(bitId: string, capsuleOptions: CapsuleOptions, options: Options) {
    const baseDir = capsuleOptions.baseDir || os.tmpdir();
    if (!options.name) options.name = v4();
    capsuleOptions.baseDir = baseDir;
    if (options.newCapsule) return path.join(baseDir, `${bitId}_${options.name}`);
    if (options.name) return path.join(baseDir, `${bitId}_${options.name}`);
    return path.join(baseDir, `${bitId}_${hash(capsuleOptions)}`);
  }

  private _generateResourceConfig(bitId: BitId, capsuleOptions: CapsuleOptions, options: Options): CreateOptions {
    const wrkDir = this._generateWrkDir(bitId.toString(), capsuleOptions, options);
    return {
      resourceId: `${bitId.toString()}_${hash(wrkDir)}`,
      options: Object.assign(
        {},
        {
          bitId,
          wrkDir
        },
        capsuleOptions
      )
    };
  }
}
