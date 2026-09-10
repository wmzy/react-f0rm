import type {JSX} from 'react';
import {createGroupItem} from './GroupItem';
import type {GroupProps, ItemProps} from './GroupItem';

export const Group: (props: GroupProps) => JSX.Element =
  createGroupItem('radio').Group;
export const Item: (props: ItemProps) => JSX.Element =
  createGroupItem('radio').Item;
