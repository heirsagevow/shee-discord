import { db } from './db';
import { insertBusinessLocation } from './seeds/seed.business-location';
import {
	insertPermissions,
	insertRolePermissions,
} from './seeds/seed.permission';
import { insertRoles, insertUserRoles } from './seeds/seed.role';
import {
	insertDefaultBusinessSetting,
	insertDefaultContactSetting,
	insertDefaultDashboardSetting,
	insertDefaultEmailSetting,
	insertDefaultEssentialSetting,
	insertDefaultHrmSetting,
	insertDefaultModuleSetting,
	insertDefaultPosSetting,
	insertDefaultPrefixSetting,
	insertDefaultProductSetting,
	insertDefaultPurchaseSetting,
	insertDefaultRewardPointSetting,
	insertDefaultSaleSetting,
	insertDefaultSmsSetting,
	insertDefaultSystemSetting,
	insertDefaultTaxSetting,
} from './seeds/seed.setting';
import { insertSuperadmin } from './seeds/seed.user';

async function seed() {
	await db.transaction(async (tx) => {
		await insertRoles(tx);
		await insertPermissions(tx);
		await insertBusinessLocation(tx);

		await insertSuperadmin(tx);

		await insertUserRoles(tx);
		await insertRolePermissions(tx);
		await insertDefaultBusinessSetting(tx);
		await insertDefaultTaxSetting(tx);
		await insertDefaultProductSetting(tx);
		await insertDefaultContactSetting(tx);
		await insertDefaultSaleSetting(tx);
		await insertDefaultPosSetting(tx);
		await insertDefaultPurchaseSetting(tx);
		await insertDefaultDashboardSetting(tx);
		await insertDefaultSystemSetting(tx);
		await insertDefaultPrefixSetting(tx);
		await insertDefaultEmailSetting(tx);
		await insertDefaultSmsSetting(tx);
		await insertDefaultRewardPointSetting(tx);
		await insertDefaultModuleSetting(tx);
		await insertDefaultHrmSetting(tx);
		await insertDefaultEssentialSetting(tx);
	});
}

seed().catch((err) => {
	console.error('❌ Seed failed:', err);
});
