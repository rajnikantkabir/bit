// import Snap from './snap';
import { Scope } from '../scope';
import { Workspace } from '../../extensions/workspace';
import { Paper } from '../paper';

export type SnapDeps = [Paper, Workspace, Scope];

export type SnapConfig = {};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function provideSnap(config: SnapConfig, [paper, workspace, scope]: SnapDeps) {
  // const snap = new Snap(workspace, scope);
  // paper.register(new SnapCommand(snap));
  // return snap;
}