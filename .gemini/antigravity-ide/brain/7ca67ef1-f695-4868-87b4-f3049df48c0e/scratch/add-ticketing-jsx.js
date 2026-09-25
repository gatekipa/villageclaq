const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../../../../../src/app/[locale]/(dashboard)/dashboard/events/page.tsx');
let content = fs.readFileSync(file, 'utf8');

const purchaseModalJSX = `
      {/* Ticket Purchase Modal */}
      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("purchaseTicket") || "Purchase Ticket"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Custody Account</Label>
              <Select value={purchaseAccountId} onValueChange={setPurchaseAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.filter(a => a.status === 'active' && a.currency === (currentGroup?.currency || 'USD')).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accounts && accounts.filter(a => a.status === 'active' && a.currency === (currentGroup?.currency || 'USD')).length === 0 && (
                <div className="flex items-center gap-2 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 rounded-md text-sm border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>No active custody accounts found in this currency. Please configure a matching bank or cash account in Settings.</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseDialog(false)} disabled={postTicket.isPending}>
              {tc("cancel")}
            </Button>
            <Button 
              onClick={handlePurchaseTicket} 
              disabled={postTicket.isPending || !purchaseAccountId}
            >
              {postTicket.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirmPurchase") || "Confirm Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
`;

// Insert the new dialog right before the closing tag of the main container.
const endOfFileRegex = /(<\/div>\s*)$/m;
if (!content.includes('Ticket Purchase Modal')) {
  content = content.replace(endOfFileRegex, purchaseModalJSX + '\n$1');
  fs.writeFileSync(file, content);
  console.log('JSX Refactor Complete');
} else {
  console.log('JSX already exists');
}
