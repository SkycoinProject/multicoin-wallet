import { NgModule } from '@angular/core';
import { WalletsComponent } from './components/pages/wallets/wallets.component';
import { SendCoinsComponent } from './components/pages/send-coins/send-coins.component';
import { RouterModule } from '@angular/router';
import { PendingTransactionsComponent } from './components/pages/settings/pending-transactions/pending-transactions.component';
import { OutputsComponent } from './components/pages/settings/outputs/outputs.component';
import { BlockchainComponent } from './components/pages/settings/blockchain/blockchain.component';
import { BackupComponent } from './components/pages/settings/backup/backup.component';
import { NetworkComponent } from './components/pages/settings/network/network.component';
import { BuyComponent } from './components/pages/buy/buy.component';
import { TransactionListComponent } from './components/pages/transaction-list/transaction-list.component';
import { WizardGuardService } from './services/wizard-guard.service';
import { OnboardingComponent } from './components/pages/onboarding/onboarding.component';
import { ResetPasswordComponent } from './components/pages/reset-password/reset-password.component';
import { ExchangeComponent } from './components/pages/exchange/exchange.component';
import { AddressHistoryComponent } from './components/pages/address-history/address-history.component';


const ROUTES = [
  {
    path: '',
    redirectTo: 'wallets',
    pathMatch: 'full',
  },
  {
    path: 'wallets',
    component: WalletsComponent,
    canActivate: [WizardGuardService],
  },
  {
    path: 'send',
    component: SendCoinsComponent,
    canActivate: [WizardGuardService],
  },
  {
    path: 'transactions',
    component: TransactionListComponent,
    canActivate: [WizardGuardService],
  },
  {
    path: 'addresses',
    component: AddressHistoryComponent,
    canActivate: [WizardGuardService],
  },
  {
    path: 'buy',
    component: BuyComponent,
    canActivate: [WizardGuardService],
  },
  {
    path: 'exchange',
    component: ExchangeComponent,
    canActivate: [WizardGuardService],
  },
  {
    path: 'settings',
    children: [
      {
        path: 'backup',
        component: BackupComponent,
      },
      {
        path: 'blockchain',
        component: BlockchainComponent,
      },
      {
        path: 'network',
        component: NetworkComponent,
      },
      {
        path: 'outputs',
        component: OutputsComponent,
      },
      {
        path: 'pending-transactions',
        component: PendingTransactionsComponent,
      },
    ],
    canActivate: [WizardGuardService],
  },
  {
    path: 'wizard',
    component: OnboardingComponent,
  },
  {
    path: 'reset/:id',
    component: ResetPasswordComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(ROUTES, { useHash: true })],
  exports: [RouterModule],
})
export class AppRoutingModule { }
