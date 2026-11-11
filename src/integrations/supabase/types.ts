export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cash_movements: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          id: string
          kind: string
          method: string
          register_id: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description: string
          id?: string
          kind?: string
          method?: string
          register_id: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          kind?: string
          method?: string
          register_id?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_counted_cents: number | null
          counted_breakdown: Json | null
          created_at: string
          difference_cents: number | null
          expected_cash_cents: number | null
          id: string
          name: string
          notes: string | null
          opened_at: string
          opening_cents: number
          status: string
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_counted_cents?: number | null
          counted_breakdown?: Json | null
          created_at?: string
          difference_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          name?: string
          notes?: string | null
          opened_at?: string
          opening_cents?: number
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_counted_cents?: number | null
          counted_breakdown?: Json | null
          created_at?: string
          difference_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          name?: string
          notes?: string | null
          opened_at?: string
          opening_cents?: number
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          print_sector: string
          sort_order: number
          store_id: string | null
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          print_sector?: string
          sort_order?: number
          store_id?: string | null
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          print_sector?: string
          sort_order?: number
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          address_number: string | null
          birthdate: string | null
          city: string | null
          complement: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          is_delivery: boolean
          name: string
          neighborhood: string | null
          notes: string | null
          phone: string | null
          reference_point: string | null
          source: string | null
          store_id: string | null
          user_id: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          birthdate?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_delivery?: boolean
          name: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          reference_point?: string | null
          source?: string | null
          store_id?: string | null
          user_id: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          birthdate?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_delivery?: boolean
          name?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          reference_point?: string | null
          source?: string | null
          store_id?: string | null
          user_id?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_entries: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          employee_id: string
          id: string
          kind: string
          paid: boolean
          ref_date: string
          store_id: string
          tab_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description?: string
          employee_id: string
          id?: string
          kind?: string
          paid?: boolean
          ref_date?: string
          store_id: string
          tab_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          employee_id?: string
          id?: string
          kind?: string
          paid?: boolean
          ref_date?: string
          store_id?: string
          tab_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_entries_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          base_salary_cents: number
          commission_pct: number
          created_at: string
          id: string
          job_title: string
          name: string
          pay_type: string
          pin: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          base_salary_cents?: number
          commission_pct?: number
          created_at?: string
          id?: string
          job_title?: string
          name: string
          pay_type?: string
          pin?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          base_salary_cents?: number
          commission_pct?: number
          created_at?: string
          id?: string
          job_title?: string
          name?: string
          pay_type?: string
          pin?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          description: string
          due_date: string
          id: string
          paid: boolean
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          provisioned: boolean
          ref_month: string | null
          store_id: string | null
          transfer_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          category?: string
          created_at?: string
          description: string
          due_date?: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          provisioned?: boolean
          ref_month?: string | null
          store_id?: string | null
          transfer_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          provisioned?: boolean
          ref_month?: string | null
          store_id?: string | null
          transfer_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          id: string
          method: string
          paid_at: string
          register_id: string | null
          store_id: string | null
          tab_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          id?: string
          method?: string
          paid_at?: string
          register_id?: string | null
          store_id?: string | null
          tab_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          id?: string
          method?: string
          paid_at?: string
          register_id?: string | null
          store_id?: string | null
          tab_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_components: {
        Row: {
          component_product_id: string
          created_at: string
          id: string
          parent_product_id: string
          quantity: number
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          component_product_id: string
          created_at?: string
          id?: string
          parent_product_id: string
          quantity?: number
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          component_product_id?: string
          created_at?: string
          id?: string
          parent_product_id?: string
          quantity?: number
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          cost_cents: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          min_stock: number
          name: string
          price_cents: number
          product_type: string
          sku: string | null
          slug: string
          stock_qty: number
          store_id: string | null
          track_stock: boolean
          unit: string
          updated_at: string
          user_id: string
          wholesale_price_cents: number
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          cost_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          price_cents?: number
          product_type?: string
          sku?: string | null
          slug?: string
          stock_qty?: number
          store_id?: string | null
          track_stock?: boolean
          unit?: string
          updated_at?: string
          user_id: string
          wholesale_price_cents?: number
        }
        Update: {
          active?: boolean
          category_id?: string | null
          cost_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          price_cents?: number
          product_type?: string
          sku?: string | null
          slug?: string
          stock_qty?: number
          store_id?: string | null
          track_stock?: boolean
          unit?: string
          updated_at?: string
          user_id?: string
          wholesale_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          balance_cents: number
          created_at: string
          document: string | null
          full_name: string
          id: string
          pending_cents: number
          phone: string | null
          pix_key: string | null
          store_name: string
          updated_at: string
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          document?: string | null
          full_name?: string
          id: string
          pending_cents?: number
          phone?: string | null
          pix_key?: string | null
          store_name?: string
          updated_at?: string
        }
        Update: {
          balance_cents?: number
          created_at?: string
          document?: string | null
          full_name?: string
          id?: string
          pending_cents?: number
          phone?: string | null
          pix_key?: string | null
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          created_at: string
          id: string
          name: string
          product_id: string | null
          purchase_id: string
          quantity: number
          received_quantity: number | null
          store_id: string | null
          total_cents: number
          unit_cost_cents: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_id?: string | null
          purchase_id: string
          quantity?: number
          received_quantity?: number | null
          store_id?: string | null
          total_cents?: number
          unit_cost_cents?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_id?: string | null
          purchase_id?: string
          quantity?: number
          received_quantity?: number | null
          store_id?: string | null
          total_cents?: number
          unit_cost_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          discount_cents: number
          expense_id: string | null
          freight_cents: number
          id: string
          invoice_number: string | null
          issued_at: string
          notes: string | null
          rejected_reason: string | null
          status: string
          store_id: string | null
          supplier: string
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount_cents?: number
          expense_id?: string | null
          freight_cents?: number
          id?: string
          invoice_number?: string | null
          issued_at?: string
          notes?: string | null
          rejected_reason?: string | null
          status?: string
          store_id?: string | null
          supplier?: string
          total_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount_cents?: number
          expense_id?: string | null
          freight_cents?: number
          id?: string
          invoice_number?: string | null
          issued_at?: string
          notes?: string | null
          rejected_reason?: string | null
          status?: string
          store_id?: string | null
          supplier?: string
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          due_date: string
          id: string
          payment_method: string | null
          received: boolean
          received_at: string | null
          received_by: string | null
          store_id: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description: string
          due_date?: string
          id?: string
          payment_method?: string | null
          received?: boolean
          received_at?: string | null
          received_by?: string | null
          store_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          payment_method?: string | null
          received?: boolean
          received_at?: string | null
          received_by?: string | null
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string
          store_id: string | null
          tab_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason?: string
          store_id?: string | null
          tab_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string
          store_id?: string | null
          tab_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          email: string | null
          employee_id: string | null
          full_name: string | null
          id: string
          modules: string[]
          role: string
          store_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string
          modules?: string[]
          role?: string
          store_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string
          modules?: string[]
          role?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          address: string | null
          code: string | null
          created_at: string
          id: string
          is_matriz: boolean
          menu_public: boolean
          menu_slug: string | null
          name: string
          owner_id: string
          parent_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_matriz?: boolean
          menu_public?: boolean
          menu_slug?: string | null
          name: string
          owner_id: string
          parent_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_matriz?: boolean
          menu_public?: boolean
          menu_slug?: string | null
          name?: string
          owner_id?: string
          parent_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          contact_name: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_items: {
        Row: {
          created_at: string
          id: string
          name: string
          product_id: string | null
          quantity: number
          store_id: string | null
          tab_id: string
          unit_price_cents: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          store_id?: string | null
          tab_id: string
          unit_price_cents?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          store_id?: string | null
          tab_id?: string
          unit_price_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      tabs: {
        Row: {
          closed_at: string | null
          courier_employee_id: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_fee_cents: number
          delivery_neighborhood: string | null
          delivery_reference: string | null
          delivery_status: string
          employee_id: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          opened_at: string
          status: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          courier_employee_id?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee_cents?: number
          delivery_neighborhood?: string | null
          delivery_reference?: string | null
          delivery_status?: string
          employee_id?: string | null
          id?: string
          kind?: string
          name: string
          notes?: string | null
          opened_at?: string
          status?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          closed_at?: string | null
          courier_employee_id?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee_cents?: number
          delivery_neighborhood?: string | null
          delivery_reference?: string | null
          delivery_status?: string
          employee_id?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          opened_at?: string
          status?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tabs_courier_employee_id_fkey"
            columns: ["courier_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_items: {
        Row: {
          created_at: string
          id: string
          name: string
          product_id: string | null
          quantity: number
          received_quantity: number | null
          total_cents: number
          transfer_id: string
          unit_price_cents: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          received_quantity?: number | null
          total_cents?: number
          transfer_id: string
          unit_price_cents?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          received_quantity?: number | null
          total_cents?: number
          transfer_id?: string
          unit_price_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          doc_number: string | null
          from_store_id: string
          id: string
          issued_at: string
          notes: string | null
          payment_status: string
          rejected_reason: string | null
          status: string
          to_store_id: string
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          doc_number?: string | null
          from_store_id: string
          id?: string
          issued_at?: string
          notes?: string | null
          payment_status?: string
          rejected_reason?: string | null
          status?: string
          to_store_id: string
          total_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          doc_number?: string | null
          from_store_id?: string
          id?: string
          issued_at?: string
          notes?: string | null
          payment_status?: string
          rejected_reason?: string | null
          status?: string
          to_store_id?: string
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_contacts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string | null
          phone: string
          role: string
          store_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string | null
          phone: string
          role?: string
          store_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string | null
          phone?: string
          role?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          id: string
          media_url: string | null
          message_sid: string | null
          pending_action: Json | null
          phone: string
          status: string
          store_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_sid?: string | null
          pending_action?: Json | null
          phone: string
          status?: string
          store_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_sid?: string | null
          pending_action?: Json | null
          phone?: string
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_purchase: { Args: { _purchase_id: string }; Returns: undefined }
      approve_transfer: { Args: { _transfer_id: string }; Returns: undefined }
      can_manage_store: { Args: { _store: string }; Returns: boolean }
      confirm_purchase: { Args: { _purchase_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_store_access: { Args: { _store: string }; Returns: boolean }
      is_menu_public: { Args: { _store: string }; Returns: boolean }
      is_store_member: { Args: { _store: string }; Returns: boolean }
      my_modules: { Args: { _store: string }; Returns: string[] }
      pay_purchase: { Args: { _purchase_id: string }; Returns: undefined }
      pay_transfer: { Args: { _transfer_id: string }; Returns: undefined }
      reject_purchase: {
        Args: { _purchase_id: string; _reason?: string }
        Returns: undefined
      }
      reject_transfer: {
        Args: { _reason?: string; _transfer_id: string }
        Returns: undefined
      }
      send_purchase: { Args: { _purchase_id: string }; Returns: undefined }
      send_transfer: { Args: { _transfer_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
