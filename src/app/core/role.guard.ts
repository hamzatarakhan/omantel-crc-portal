import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { CrcStore } from './services/crc-store.service';
import { UiService } from '../shared/services/ui.service';

/** Blocks screens the current role has no access to (e.g. a notification link to a screen outside the role). */
export const roleGuard: CanActivateChildFn = (_route, state) => {
  const store = inject(CrcStore);
  if (store.canAccessUrl(state.url)) return true;
  inject(UiService).toast(`That screen is not available for the ${store.currentRole()} role — opening your home screen instead.`, 4500);
  return inject(Router).parseUrl(store.landingRoute());
};
