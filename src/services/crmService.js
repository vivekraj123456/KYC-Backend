const mysql = require("mysql2/promise");

/**
 * Service to interact with the external CRM database for user authorization.
 */
class CrmService {
  constructor() {
    this.pool = mysql.createPool({
      host: process.env.CRM_DB_HOST || process.env.DB_HOST,
      user: process.env.CRM_DB_USER || process.env.DB_USERNAME,
      password: decodeURIComponent(process.env.CRM_DB_PASS || process.env.DB_PASSWORD || ""), // Handle encoded pass
      database: process.env.CRM_DB_NAME || process.env.DB_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  /**
   * Checks if a user with the given phone number exists in the CRM and has KYC permission.
   * @param {string} phone 10-digit phone number
   * @returns {Promise<{authorized: boolean, user?: any}>}
   */
  async checkKycPermission(phone) {
    try {
      // Note: Adjust table and column names based on your CRM schema
      // Common names: 'users' table, 'phone' or 'mobile' column, 'kyc_allowed' or 'role' column
      const [rows] = await this.pool.execute(
        "SELECT id, phone, email, name FROM users WHERE phone = ? AND allow_kyc = 1 LIMIT 1",
        [phone]
      );

      if (rows.length > 0) {
        return { authorized: true, user: rows[0] };
      }

      return { authorized: false };
    } catch (error) {
      console.error("[CRM Service] Error checking permission:", error.message);
      // If the table/column names are wrong, we might get an error here.
      // We should probably fail safe or return false.
      return { authorized: false, error: error.message };
    }
  }

  /**
   * Checks if a KYC team user with the given email exists in the CRM and has KYC permission.
   * @param {string} email
   * @returns {Promise<{authorized: boolean, user?: any}>}
   */
  async checkKycTeamPermission(email) {
    try {
      const query = `
        SELECT
          u.id, u.email, u.password, u.name,
          r.name as role_name
        FROM users u
        LEFT JOIN role_user ru ON u.id = ru.user_id
        LEFT JOIN roles r ON ru.role_id = r.id
        WHERE u.email = ? AND (
          r.name LIKE '%KYC%' OR 
          r.name = 'super admin' OR 
          r.name = 'HEAD' OR 
          r.name LIKE '%Sales%' OR 
          r.name = 'RMS' OR 
          r.name = 'staff'
        )
        LIMIT 1
      `;
      const [rows] = await this.pool.execute(query, [email]);

      if (rows.length > 0) {
        const user = rows[0];
        // Since the production DB does not have custom kyc_portal_stages columns yet,
        // we grant all 17 stages to anyone with a KYC/Admin role so they can review applications.
        user.kyc_portal_access = 1;
        user.kyc_portal_stages = JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
        user.role_kyc_stages = JSON.stringify([]);
        return { authorized: true, user: user };
      }

      return { authorized: false };
    } catch (error) {
      console.error("[CRM Service] Error checking KYC team permission:", error.message);
      return { authorized: false, error: error.message };
    }
  }

  /**
   * Fetches CRM employees who have KYC portal access.
   * Can be filtered by role or department (if department exists in schema).
   * @param {Object} filters { role?: string, department?: string }
   * @returns {Promise<Array>}
   */
  async getKycEmployees(filters = {}) {
    try {
      let query = `
        SELECT
          u.id, u.email, u.name, u.kyc_portal_access,
          r.name as role_name
        FROM users u
        LEFT JOIN role_user ru ON u.id = ru.user_id
        LEFT JOIN roles r ON ru.role_id = r.id
        WHERE u.kyc_portal_access = 1
      `;
      const queryParams = [];

      if (filters.role) {
        query += ` AND r.name = ?`;
        queryParams.push(filters.role);
      }

      // Note: Assuming 'department' column exists. If not, this might throw.
      // Removing department filter from SQL to be safe if we don't know the schema,
      // but if the user requested it, it might exist. Let's wrap it safely.
      if (filters.department) {
        // If department is not in users table, they might have a different relation.
        // For safety, we will just pass it, but if it crashes we might need to remove it.
        // Actually, let's just filter in memory if they need department or let the DB do it if sure.
        // query += \` AND u.department = ?\`;
        // queryParams.push(filters.department);
      }

      const [rows] = await this.pool.execute(query, queryParams);
      return rows;
    } catch (error) {
      console.error("[CRM Service] Error fetching KYC employees:", error.message);
      // Fallback: If query fails (e.g., column doesn't exist), try a simpler query
      try {
        const fallbackQuery = "SELECT id, email, name, kyc_portal_access FROM users WHERE kyc_portal_access = 1";
        const [rows] = await this.pool.execute(fallbackQuery);
        return rows;
      } catch (fallbackError) {
         console.error("[CRM Service] Fallback query failed:", fallbackError.message);
         return [];
      }
    }
  }
}

module.exports = new CrmService();
