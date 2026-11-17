CREATE TABLE "dim_account" (
	"account_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"grp" text NOT NULL,
	"discretionary" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_action" (
	"action_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"driver_ref" text NOT NULL,
	"owner_role" text NOT NULL,
	"potential_inr" bigint NOT NULL,
	"kind" text NOT NULL,
	"timeline_days" integer NOT NULL,
	"implementation_cost_inr" bigint NOT NULL,
	"overlaps_with" text,
	"depends_on" text,
	"risk" text NOT NULL,
	"confidence" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_bu" (
	"bu_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_customer" (
	"customer_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entity_id" text NOT NULL,
	"region" text NOT NULL,
	"segment" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_entity" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"functional_currency" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_period" (
	"period" text PRIMARY KEY NOT NULL,
	"fiscal_year" text NOT NULL,
	"fiscal_month" integer NOT NULL,
	"is_closed_actual" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_product" (
	"sku_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bu_id" text NOT NULL,
	"budget_list_price_inr" bigint NOT NULL,
	"std_margin_bps" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_supplier" (
	"supplier_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"contract_end_period" text NOT NULL,
	"price_escalation_bps" integer NOT NULL,
	"quality_score" integer NOT NULL,
	"alt_sources" integer NOT NULL,
	"renegotiation_candidate" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"fiscal_year" text NOT NULL,
	"as_of_period" text
);
--> statement-breakpoint
CREATE TABLE "fact_demand_assumption" (
	"version_id" text NOT NULL,
	"bu_id" text NOT NULL,
	"growth_bps" integer NOT NULL,
	CONSTRAINT "fact_demand_assumption_version_id_bu_id_pk" PRIMARY KEY("version_id","bu_id")
);
--> statement-breakpoint
CREATE TABLE "fact_forecast_bridge" (
	"from_version_id" text NOT NULL,
	"to_version_id" text NOT NULL,
	"driver" text NOT NULL,
	"sub_driver" text NOT NULL,
	"period" text NOT NULL,
	"entity_id" text NOT NULL,
	"bu_id" text NOT NULL,
	"amount_inr" bigint NOT NULL,
	CONSTRAINT "fact_forecast_bridge_driver_sub_driver_period_entity_id_bu_id_pk" PRIMARY KEY("driver","sub_driver","period","entity_id","bu_id")
);
--> statement-breakpoint
CREATE TABLE "fact_gl" (
	"version_id" text NOT NULL,
	"period" text NOT NULL,
	"entity_id" text NOT NULL,
	"bu_id" text NOT NULL,
	"account_id" text NOT NULL,
	"amount_inr" bigint NOT NULL,
	CONSTRAINT "fact_gl_version_id_period_entity_id_bu_id_account_id_pk" PRIMARY KEY("version_id","period","entity_id","bu_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "fact_headcount" (
	"version_id" text NOT NULL,
	"period" text NOT NULL,
	"entity_id" text NOT NULL,
	"department" text NOT NULL,
	"headcount" integer NOT NULL,
	"cost_inr" bigint NOT NULL,
	CONSTRAINT "fact_headcount_version_id_period_entity_id_department_pk" PRIMARY KEY("version_id","period","entity_id","department")
);
--> statement-breakpoint
CREATE TABLE "fact_opex_txn" (
	"txn_id" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"entity_id" text NOT NULL,
	"cost_center" text NOT NULL,
	"account_id" text NOT NULL,
	"vendor" text NOT NULL,
	"amount_inr" bigint NOT NULL,
	"discretionary" boolean NOT NULL,
	"pre_approved" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_order_book" (
	"order_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"quantity" bigint NOT NULL,
	"value_inr" bigint NOT NULL,
	"original_delivery_period" text NOT NULL,
	"current_delivery_period" text NOT NULL,
	"status" text NOT NULL,
	"delay_reason" text
);
--> statement-breakpoint
CREATE TABLE "fact_planner_override" (
	"version_id" text NOT NULL,
	"period" text NOT NULL,
	"entity_id" text NOT NULL,
	"bu_id" text NOT NULL,
	"driver" text NOT NULL,
	"delta_inr" bigint NOT NULL,
	"role" text NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "fact_planner_override_version_id_period_entity_id_bu_id_pk" PRIMARY KEY("version_id","period","entity_id","bu_id")
);
--> statement-breakpoint
CREATE TABLE "fact_sales_line" (
	"line_key" text NOT NULL,
	"version_id" text NOT NULL,
	"period" text NOT NULL,
	"entity_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"bu_id" text NOT NULL,
	"quantity" bigint NOT NULL,
	"list_price_inr" bigint NOT NULL,
	"gross_amount_inr" bigint NOT NULL,
	"discount_inr" bigint NOT NULL,
	"net_amount_inr" bigint NOT NULL,
	"order_id" text,
	"delayed_to_period" text,
	CONSTRAINT "fact_sales_line_line_key_version_id_pk" PRIMARY KEY("line_key","version_id")
);
--> statement-breakpoint
CREATE TABLE "fact_supplier_spend" (
	"period" text NOT NULL,
	"supplier_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"amount_inr" bigint NOT NULL,
	CONSTRAINT "fact_supplier_spend_period_supplier_id_entity_id_pk" PRIMARY KEY("period","supplier_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"version_id" text NOT NULL,
	"period" text NOT NULL,
	"currency" text NOT NULL,
	"rate_inr" double precision NOT NULL,
	CONSTRAINT "fx_rate_version_id_period_currency_pk" PRIMARY KEY("version_id","period","currency")
);
--> statement-breakpoint
ALTER TABLE "dim_customer" ADD CONSTRAINT "dim_customer_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dim_product" ADD CONSTRAINT "dim_product_bu_id_dim_bu_bu_id_fk" FOREIGN KEY ("bu_id") REFERENCES "public"."dim_bu"("bu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_demand_assumption" ADD CONSTRAINT "fact_demand_assumption_version_id_dim_version_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dim_version"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_demand_assumption" ADD CONSTRAINT "fact_demand_assumption_bu_id_dim_bu_bu_id_fk" FOREIGN KEY ("bu_id") REFERENCES "public"."dim_bu"("bu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_forecast_bridge" ADD CONSTRAINT "fact_forecast_bridge_from_version_id_dim_version_version_id_fk" FOREIGN KEY ("from_version_id") REFERENCES "public"."dim_version"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_forecast_bridge" ADD CONSTRAINT "fact_forecast_bridge_to_version_id_dim_version_version_id_fk" FOREIGN KEY ("to_version_id") REFERENCES "public"."dim_version"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_forecast_bridge" ADD CONSTRAINT "fact_forecast_bridge_period_dim_period_period_fk" FOREIGN KEY ("period") REFERENCES "public"."dim_period"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_forecast_bridge" ADD CONSTRAINT "fact_forecast_bridge_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_forecast_bridge" ADD CONSTRAINT "fact_forecast_bridge_bu_id_dim_bu_bu_id_fk" FOREIGN KEY ("bu_id") REFERENCES "public"."dim_bu"("bu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_gl" ADD CONSTRAINT "fact_gl_version_id_dim_version_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dim_version"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_gl" ADD CONSTRAINT "fact_gl_period_dim_period_period_fk" FOREIGN KEY ("period") REFERENCES "public"."dim_period"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_gl" ADD CONSTRAINT "fact_gl_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_gl" ADD CONSTRAINT "fact_gl_bu_id_dim_bu_bu_id_fk" FOREIGN KEY ("bu_id") REFERENCES "public"."dim_bu"("bu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_gl" ADD CONSTRAINT "fact_gl_account_id_dim_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."dim_account"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_headcount" ADD CONSTRAINT "fact_headcount_version_id_dim_version_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dim_version"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_headcount" ADD CONSTRAINT "fact_headcount_period_dim_period_period_fk" FOREIGN KEY ("period") REFERENCES "public"."dim_period"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_headcount" ADD CONSTRAINT "fact_headcount_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_opex_txn" ADD CONSTRAINT "fact_opex_txn_period_dim_period_period_fk" FOREIGN KEY ("period") REFERENCES "public"."dim_period"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_opex_txn" ADD CONSTRAINT "fact_opex_txn_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_opex_txn" ADD CONSTRAINT "fact_opex_txn_account_id_dim_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."dim_account"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_order_book" ADD CONSTRAINT "fact_order_book_customer_id_dim_customer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_order_book" ADD CONSTRAINT "fact_order_book_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_order_book" ADD CONSTRAINT "fact_order_book_sku_id_dim_product_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."dim_product"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_planner_override" ADD CONSTRAINT "fact_planner_override_version_id_dim_version_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dim_version"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_planner_override" ADD CONSTRAINT "fact_planner_override_period_dim_period_period_fk" FOREIGN KEY ("period") REFERENCES "public"."dim_period"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_planner_override" ADD CONSTRAINT "fact_planner_override_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_planner_override" ADD CONSTRAINT "fact_planner_override_bu_id_dim_bu_bu_id_fk" FOREIGN KEY ("bu_id") REFERENCES "public"."dim_bu"("bu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sales_line" ADD CONSTRAINT "fact_sales_line_version_id_dim_version_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dim_version"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sales_line" ADD CONSTRAINT "fact_sales_line_period_dim_period_period_fk" FOREIGN KEY ("period") REFERENCES "public"."dim_period"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sales_line" ADD CONSTRAINT "fact_sales_line_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sales_line" ADD CONSTRAINT "fact_sales_line_customer_id_dim_customer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sales_line" ADD CONSTRAINT "fact_sales_line_sku_id_dim_product_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."dim_product"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sales_line" ADD CONSTRAINT "fact_sales_line_bu_id_dim_bu_bu_id_fk" FOREIGN KEY ("bu_id") REFERENCES "public"."dim_bu"("bu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_supplier_spend" ADD CONSTRAINT "fact_supplier_spend_period_dim_period_period_fk" FOREIGN KEY ("period") REFERENCES "public"."dim_period"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_supplier_spend" ADD CONSTRAINT "fact_supplier_spend_supplier_id_dim_supplier_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."dim_supplier"("supplier_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_supplier_spend" ADD CONSTRAINT "fact_supplier_spend_entity_id_dim_entity_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_version_id_dim_version_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dim_version"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_period_dim_period_period_fk" FOREIGN KEY ("period") REFERENCES "public"."dim_period"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fact_gl_period_idx" ON "fact_gl" USING btree ("period","version_id");