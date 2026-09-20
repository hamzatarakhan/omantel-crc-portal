import { Component, Inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { DataTableComponent, TableColumn } from '../data-table/data-table.component';
import { Contract } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';

export interface VendorDetailData {
  vendorName: string;
  contracts: Contract[];
}

@Component({
  selector: 'app-vendor-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, DataTableComponent],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <mat-icon class="!text-2xl">store</mat-icon>
          </div>
          <div>
            <h2 class="text-base font-bold text-ink-900">{{ data.vendorName }}</h2>
            <p class="text-xs text-ink-400 mt-0.5">Vendor overview — all synced contracts</p>
          </div>
        </div>
        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700 transition-colors" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4">
        <div class="surface-card px-3 py-2.5">
          <div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Contracts</div>
          <div class="text-lg font-extrabold text-ink-900 mt-1">{{ data.contracts.length }}</div>
        </div>
        <div class="surface-card px-3 py-2.5">
          <div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Total Value</div>
          <div class="text-lg font-extrabold text-ink-900 mt-1">{{ totalValue | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">OMR</span></div>
        </div>
        <div class="surface-card px-3 py-2.5">
          <div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Active</div>
          <div class="text-lg font-extrabold text-status-normal mt-1">{{ activeCount }}</div>
        </div>
        <div class="surface-card px-3 py-2.5">
          <div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Expiring / Expired</div>
          <div class="text-lg font-extrabold text-status-red mt-1">{{ expiringOrExpiredCount }}</div>
        </div>
      </div>

      <div class="px-6 pb-6">
        <app-data-table [columns]="columns" [rows]="data.contracts" [pageSize]="5" [exportable]="false" (rowClick)="open($event)"></app-data-table>
        <p class="text-xs text-ink-400 mt-2">Click a contract to open it.</p>
      </div>
    </div>
  `,
})
export class VendorDetailDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: VendorDetailData,
    private ref: MatDialogRef<VendorDetailDialogComponent>,
    private router: Router,
  ) {}

  open(c: Contract) {
    this.ref.close();
    this.router.navigate(['/contracts-budget/contracts', c.id]);
  }

  get totalValue() {
    return this.data.contracts.reduce((sum, c) => sum + c.amount, 0);
  }
  get activeCount() {
    return this.data.contracts.filter((c) => c.status === 'Active').length;
  }
  get expiringOrExpiredCount() {
    return this.data.contracts.filter((c) => c.status === 'Expiring Soon' || c.status === 'Expired').length;
  }

  columns: TableColumn<Contract>[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'contractType', label: 'Type' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    {
      key: 'status', label: 'Status', type: 'status',
      statusFn: (row) => ({ label: row.status, level: row.status === 'Cancelled' ? 'neutral' : row.renewalStatus === 'Renewed' ? 'info' : daysRemainingToLevel(row.daysRemaining) }),
    },
  ];

  close() {
    this.ref.close();
  }
}
