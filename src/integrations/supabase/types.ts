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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      advances: {
        Row: {
          amount: number
          balance: number | null
          created_at: string
          driver_id: string
          id: string
          issued_at: string
          notes: string | null
          settled_at: string | null
          settled_expenses: number | null
          status: string
          trip_id: string | null
        }
        Insert: {
          amount: number
          balance?: number | null
          created_at?: string
          driver_id: string
          id?: string
          issued_at?: string
          notes?: string | null
          settled_at?: string | null
          settled_expenses?: number | null
          status?: string
          trip_id?: string | null
        }
        Update: {
          amount?: number
          balance?: number | null
          created_at?: string
          driver_id?: string
          id?: string
          issued_at?: string
          notes?: string | null
          settled_at?: string | null
          settled_expenses?: number | null
          status?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advances_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          branch_id: string | null
          capacity_tons: number | null
          code: string
          created_at: string
          id: string
          kind: string
          last_lat: number | null
          last_lng: number | null
          last_position_at: string | null
          last_position_source: string | null
          location_text: string | null
          make_model: string | null
          notes: string | null
          odometer_km: number | null
          plate: string | null
          status: string
          trailer_type: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          branch_id?: string | null
          capacity_tons?: number | null
          code: string
          created_at?: string
          id?: string
          kind: string
          last_lat?: number | null
          last_lng?: number | null
          last_position_at?: string | null
          last_position_source?: string | null
          location_text?: string | null
          make_model?: string | null
          notes?: string | null
          odometer_km?: number | null
          plate?: string | null
          status?: string
          trailer_type?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          branch_id?: string | null
          capacity_tons?: number | null
          code?: string
          created_at?: string
          id?: string
          kind?: string
          last_lat?: number | null
          last_lng?: number | null
          last_position_at?: string | null
          last_position_source?: string | null
          location_text?: string | null
          make_model?: string | null
          notes?: string | null
          odometer_km?: number | null
          plate?: string | null
          status?: string
          trailer_type?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          data: Json | null
          id: number
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          data?: Json | null
          id?: number
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          data?: Json | null
          id?: number
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      authorizations: {
        Row: {
          asset_id: string | null
          created_at: string
          driver_id: string
          file_path: string | null
          id: string
          number: string | null
          review_status: string
          scope: string | null
          valid_from: string
          valid_to: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          driver_id: string
          file_path?: string | null
          id?: string
          number?: string | null
          review_status?: string
          scope?: string | null
          valid_from: string
          valid_to: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          driver_id?: string
          file_path?: string | null
          id?: string
          number?: string | null
          review_status?: string
          scope?: string | null
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorizations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorizations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          city: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      carriers: {
        Row: {
          contact_name: string | null
          cr_number: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          status: string
        }
        Insert: {
          contact_name?: string | null
          cr_number?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          status?: string
        }
        Update: {
          contact_name?: string | null
          cr_number?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          company_name: string
          cr_number: string | null
          doc_expiry_warning_days: number
          id: number
          timezone: string
          updated_at: string
          vat_number: string | null
          vat_rate: number
        }
        Insert: {
          company_name?: string
          cr_number?: string | null
          doc_expiry_warning_days?: number
          id?: number
          timezone?: string
          updated_at?: string
          vat_number?: string | null
          vat_rate?: number
        }
        Update: {
          company_name?: string
          cr_number?: string | null
          doc_expiry_warning_days?: number
          id?: number
          timezone?: string
          updated_at?: string
          vat_number?: string | null
          vat_rate?: number
        }
        Relationships: []
      }
      contracts: {
        Row: {
          created_at: string
          customer_id: string
          end_date: string | null
          free_wait_hours: number
          id: string
          number: string
          pricing_model: string
          rate: number
          start_date: string | null
          status: string
          terms: string | null
          version: number
          wait_fee_per_hour: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          end_date?: string | null
          free_wait_hours?: number
          id?: string
          number: string
          pricing_model?: string
          rate?: number
          start_date?: string | null
          status?: string
          terms?: string | null
          version?: number
          wait_fee_per_hour?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          end_date?: string | null
          free_wait_hours?: number
          id?: string
          number?: string
          pricing_model?: string
          rate?: number
          start_date?: string | null
          status?: string
          terms?: string | null
          version?: number
          wait_fee_per_hour?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      custody: {
        Row: {
          accessories: string | null
          acknowledged: boolean
          asset_id: string
          closed_at: string | null
          created_at: string
          damages: string | null
          driver_id: string
          fuel_level_in: string | null
          fuel_level_out: string | null
          id: string
          notes: string | null
          odometer_in: number | null
          odometer_out: number | null
          opened_at: string
          previous_custody_id: string | null
        }
        Insert: {
          accessories?: string | null
          acknowledged?: boolean
          asset_id: string
          closed_at?: string | null
          created_at?: string
          damages?: string | null
          driver_id: string
          fuel_level_in?: string | null
          fuel_level_out?: string | null
          id?: string
          notes?: string | null
          odometer_in?: number | null
          odometer_out?: number | null
          opened_at?: string
          previous_custody_id?: string | null
        }
        Update: {
          accessories?: string | null
          acknowledged?: boolean
          asset_id?: string
          closed_at?: string | null
          created_at?: string
          damages?: string | null
          driver_id?: string
          fuel_level_in?: string | null
          fuel_level_out?: string | null
          id?: string
          notes?: string | null
          odometer_in?: number | null
          odometer_out?: number | null
          opened_at?: string
          previous_custody_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custody_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_previous_custody_id_fkey"
            columns: ["previous_custody_id"]
            isOneToOne: false
            referencedRelation: "custody"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          city: string | null
          contact_name: string | null
          cr_number: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          payment_terms_days: number
          phone: string | null
          status: string
          vat_number: string | null
        }
        Insert: {
          city?: string | null
          contact_name?: string | null
          cr_number?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          payment_terms_days?: number
          phone?: string | null
          status?: string
          vat_number?: string | null
        }
        Update: {
          city?: string | null
          contact_name?: string | null
          cr_number?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          payment_terms_days?: number
          phone?: string | null
          status?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string
          entity_id: string | null
          entity_type: string
          expiry_date: string | null
          file_path: string | null
          id: string
          issue_date: string | null
          notes: string | null
          number: string | null
          review_status: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          entity_id?: string | null
          entity_type: string
          expiry_date?: string | null
          file_path?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          number?: string | null
          review_status?: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          entity_id?: string | null
          entity_type?: string
          expiry_date?: string | null
          file_path?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          number?: string | null
          review_status?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          branch_id: string | null
          code: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          license_expiry: string | null
          license_no: string | null
          national_id: string | null
          nationality: string | null
          phone: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          code: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          license_expiry?: string | null
          license_no?: string | null
          national_id?: string | null
          nationality?: string | null
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          code?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          license_expiry?: string | null
          license_no?: string | null
          national_id?: string | null
          nationality?: string | null
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          client_event_id: string | null
          created_at: string
          description: string | null
          driver_id: string | null
          id: string
          payment_method: string
          receipt_path: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          spent_at: string
          status: string
          trip_id: string | null
        }
        Insert: {
          amount: number
          category: string
          client_event_id?: string | null
          created_at?: string
          description?: string | null
          driver_id?: string | null
          id?: string
          payment_method?: string
          receipt_path?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_at?: string
          status?: string
          trip_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          client_event_id?: string | null
          created_at?: string
          description?: string | null
          driver_id?: string | null
          id?: string
          payment_method?: string
          receipt_path?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_at?: string
          status?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_entries: {
        Row: {
          amount: number
          asset_id: string
          client_event_id: string | null
          created_at: string
          driver_id: string | null
          filled_at: string
          full_tank: boolean
          id: string
          liters: number
          odometer: number | null
          receipt_path: string | null
          source: string
          station: string | null
          status: string
          trip_id: string | null
          unit_price: number
        }
        Insert: {
          amount: number
          asset_id: string
          client_event_id?: string | null
          created_at?: string
          driver_id?: string | null
          filled_at?: string
          full_tank?: boolean
          id?: string
          liters: number
          odometer?: number | null
          receipt_path?: string | null
          source?: string
          station?: string | null
          status?: string
          trip_id?: string | null
          unit_price: number
        }
        Update: {
          amount?: number
          asset_id?: string
          client_event_id?: string | null
          created_at?: string
          driver_id?: string | null
          filled_at?: string
          full_tank?: boolean
          id?: string
          liters?: number
          odometer?: number | null
          receipt_path?: string | null
          source?: string
          station?: string | null
          status?: string
          trip_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fuel_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_readings: {
        Row: {
          asset_id: string
          event_time: string
          id: string
          lat: number
          lng: number
          reading_id: string
          received_time: string
          source: string
          speed_kmh: number | null
        }
        Insert: {
          asset_id: string
          event_time: string
          id?: string
          lat: number
          lng: number
          reading_id: string
          received_time?: string
          source?: string
          speed_kmh?: number | null
        }
        Update: {
          asset_id?: string
          event_time?: string
          id?: string
          lat?: number
          lng?: number
          reading_id?: string
          received_time?: string
          source?: string
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_readings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          approved_liability: string | null
          asset_id: string | null
          client_event_id: string | null
          created_at: string
          created_by: string | null
          description: string
          driver_id: string | null
          est_cost: number | null
          id: string
          insurance_claim_ref: string | null
          kind: string
          location_text: string | null
          number: string
          occurred_at: string
          parties: string | null
          photo_paths: string[]
          police_ref: string | null
          severity: string
          status: string
          trip_id: string | null
        }
        Insert: {
          approved_liability?: string | null
          asset_id?: string | null
          client_event_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          driver_id?: string | null
          est_cost?: number | null
          id?: string
          insurance_claim_ref?: string | null
          kind?: string
          location_text?: string | null
          number?: string
          occurred_at?: string
          parties?: string | null
          photo_paths?: string[]
          police_ref?: string | null
          severity?: string
          status?: string
          trip_id?: string | null
        }
        Update: {
          approved_liability?: string | null
          asset_id?: string | null
          client_event_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          driver_id?: string | null
          est_cost?: number | null
          id?: string
          insurance_claim_ref?: string | null
          kind?: string
          location_text?: string | null
          number?: string
          occurred_at?: string
          parties?: string | null
          photo_paths?: string[]
          police_ref?: string | null
          severity?: string
          status?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          has_critical: boolean
          id: string
          items: Json
          kind: string
          notes: string | null
          resolved: boolean
          template_version: string
          trip_id: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          has_critical?: boolean
          id?: string
          items?: Json
          kind?: string
          notes?: string | null
          resolved?: boolean
          template_version?: string
          trip_id?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          has_critical?: boolean
          id?: string
          items?: Json
          kind?: string
          notes?: string | null
          resolved?: boolean
          template_version?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_trip_fk"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          driver_id: string | null
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          driver_id?: string | null
          email: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          driver_id?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          trip_id: string | null
        }
        Insert: {
          amount: number
          description: string
          id?: string
          invoice_id: string
          trip_id?: string | null
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string
          discount: number
          due_at: string | null
          id: string
          issued_at: string
          number: string
          provider_ref: string | null
          provider_status: string
          status: string
          subtotal: number
          total: number
          vat: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          discount?: number
          due_at?: string | null
          id?: string
          issued_at?: string
          number?: string
          provider_ref?: string | null
          provider_status?: string
          status?: string
          subtotal?: number
          total?: number
          vat?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          discount?: number
          due_at?: string | null
          id?: string
          issued_at?: string
          number?: string
          provider_ref?: string | null
          provider_status?: string
          status?: string
          subtotal?: number
          total?: number
          vat?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city: string
          contact: string | null
          created_at: string
          customer_id: string | null
          id: string
          instructions: string | null
          lat: number | null
          lng: number | null
          name: string
          working_hours: string | null
        }
        Insert: {
          city: string
          contact?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          instructions?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          working_hours?: string | null
        }
        Update: {
          city?: string
          contact?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          instructions?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          working_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          interval_days: number | null
          interval_km: number | null
          last_done_at: string | null
          last_done_km: number | null
          title: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_km?: number | null
          last_done_at?: string | null
          last_done_km?: number | null
          title: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_km?: number | null
          last_done_at?: string | null
          last_done_km?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          severity: string
          status: string
          title: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          severity?: string
          status?: string
          title: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          severity?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      parts: {
        Row: {
          created_at: string
          id: string
          name: string
          qty_on_hand: number
          reorder_level: number
          sku: string
          unit: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          qty_on_hand?: number
          reorder_level?: number
          sku: string
          unit?: string
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          qty_on_hand?: number
          reorder_level?: number
          sku?: string
          unit?: string
          unit_cost?: number
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          id: string
          method: string
          paid_at: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          id?: string
          method?: string
          paid_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          method?: string
          paid_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pods: {
        Row: {
          captured_at: string | null
          client_event_id: string | null
          created_at: string
          created_by: string | null
          id: string
          lat: number | null
          lng: number | null
          location_source: string | null
          notes: string | null
          photo_paths: string[]
          qty_damaged: number | null
          qty_delivered: number | null
          qty_short: number | null
          received_at: string
          receiver_name: string
          receiver_phone: string | null
          signature: string | null
          status: string
          trip_id: string
        }
        Insert: {
          captured_at?: string | null
          client_event_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_source?: string | null
          notes?: string | null
          photo_paths?: string[]
          qty_damaged?: number | null
          qty_delivered?: number | null
          qty_short?: number | null
          received_at?: string
          receiver_name: string
          receiver_phone?: string | null
          signature?: string | null
          status?: string
          trip_id: string
        }
        Update: {
          captured_at?: string | null
          client_event_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_source?: string | null
          notes?: string | null
          photo_paths?: string[]
          qty_damaged?: number | null
          qty_delivered?: number | null
          qty_short?: number | null
          received_at?: string
          receiver_name?: string
          receiver_phone?: string | null
          signature?: string | null
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pods_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_bookings: {
        Row: {
          active: boolean
          created_at: string
          id: string
          period: unknown
          resource_id: string
          resource_type: string
          trip_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          period: unknown
          resource_id: string
          resource_type: string
          trip_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          period?: unknown
          resource_id?: string
          resource_type?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_moves: {
        Row: {
          client_ref: string | null
          created_at: string
          id: string
          kind: string
          notes: string | null
          part_id: string
          qty: number
          unit_cost: number
          work_order_id: string | null
        }
        Insert: {
          client_ref?: string | null
          created_at?: string
          id?: string
          kind: string
          notes?: string | null
          part_id: string
          qty: number
          unit_cost?: number
          work_order_id?: string | null
        }
        Update: {
          client_ref?: string | null
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          part_id?: string
          qty?: number
          unit_cost?: number
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_moves_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tire_mounts: {
        Row: {
          asset_id: string
          axle: number | null
          id: string
          mounted_at: string
          mounted_km: number | null
          position: string
          removed_at: string | null
          removed_km: number | null
          tire_id: string
        }
        Insert: {
          asset_id: string
          axle?: number | null
          id?: string
          mounted_at?: string
          mounted_km?: number | null
          position: string
          removed_at?: string | null
          removed_km?: number | null
          tire_id: string
        }
        Update: {
          asset_id?: string
          axle?: number | null
          id?: string
          mounted_at?: string
          mounted_km?: number | null
          position?: string
          removed_at?: string | null
          removed_km?: number | null
          tire_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tire_mounts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tire_mounts_tire_id_fkey"
            columns: ["tire_id"]
            isOneToOne: false
            referencedRelation: "tires"
            referencedColumns: ["id"]
          },
        ]
      }
      tires: {
        Row: {
          brand: string | null
          cost: number | null
          created_at: string
          id: string
          serial: string
          size: string | null
          status: string
        }
        Insert: {
          brand?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          serial: string
          size?: string | null
          status?: string
        }
        Update: {
          brand?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          serial?: string
          size?: string | null
          status?: string
        }
        Relationships: []
      }
      transport_orders: {
        Row: {
          cargo_type: string
          consignee: string | null
          contract_id: string | null
          contract_snapshot: Json | null
          created_at: string
          created_by: string | null
          customer_id: string
          delivery_due_at: string | null
          delivery_location_id: string | null
          id: string
          notes: string | null
          number: string
          pickup_at: string | null
          pickup_location_id: string | null
          price: number
          quantity: number | null
          requirements: string | null
          shipper: string | null
          status: string
          unit: string
          weight_kg: number | null
        }
        Insert: {
          cargo_type?: string
          consignee?: string | null
          contract_id?: string | null
          contract_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          delivery_due_at?: string | null
          delivery_location_id?: string | null
          id?: string
          notes?: string | null
          number?: string
          pickup_at?: string | null
          pickup_location_id?: string | null
          price?: number
          quantity?: number | null
          requirements?: string | null
          shipper?: string | null
          status?: string
          unit?: string
          weight_kg?: number | null
        }
        Update: {
          cargo_type?: string
          consignee?: string | null
          contract_id?: string | null
          contract_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delivery_due_at?: string | null
          delivery_location_id?: string | null
          id?: string
          notes?: string | null
          number?: string
          pickup_at?: string | null
          pickup_location_id?: string | null
          price?: number
          quantity?: number | null
          requirements?: string | null
          shipper?: string | null
          status?: string
          unit?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_orders_delivery_location_id_fkey"
            columns: ["delivery_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_orders_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_events: {
        Row: {
          client_event_id: string | null
          created_by: string | null
          event_type: string
          id: string
          lat: number | null
          lng: number | null
          location_text: string | null
          notes: string | null
          occurred_at: string
          received_at: string
          trip_id: string
        }
        Insert: {
          client_event_id?: string | null
          created_by?: string | null
          event_type: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          notes?: string | null
          occurred_at?: string
          received_at?: string
          trip_id: string
        }
        Update: {
          client_event_id?: string | null
          created_by?: string | null
          event_type?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          notes?: string | null
          occurred_at?: string
          received_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_financials: {
        Row: {
          approved: boolean
          carrier_cost: number
          est_cost: number
          revenue: number
          trip_id: string
        }
        Insert: {
          approved?: boolean
          carrier_cost?: number
          est_cost?: number
          revenue?: number
          trip_id: string
        }
        Update: {
          approved?: boolean
          carrier_cost?: number
          est_cost?: number
          revenue?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_financials_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          backup_driver_id: string | null
          cancel_reason: string | null
          cargo_weight_tons: number | null
          carrier_id: string | null
          created_at: string
          dest_city: string
          dest_location_id: string | null
          distance_km: number | null
          driver_id: string | null
          empty_reason: string | null
          exception: string | null
          id: string
          is_empty: boolean
          number: string
          order_id: string | null
          origin_city: string
          origin_location_id: string | null
          parent_trip_id: string | null
          planned_end: string | null
          planned_start: string | null
          stage: string
          status: string
          tractor_id: string | null
          trailer_id: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          backup_driver_id?: string | null
          cancel_reason?: string | null
          cargo_weight_tons?: number | null
          carrier_id?: string | null
          created_at?: string
          dest_city: string
          dest_location_id?: string | null
          distance_km?: number | null
          driver_id?: string | null
          empty_reason?: string | null
          exception?: string | null
          id?: string
          is_empty?: boolean
          number?: string
          order_id?: string | null
          origin_city: string
          origin_location_id?: string | null
          parent_trip_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          stage?: string
          status?: string
          tractor_id?: string | null
          trailer_id?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          backup_driver_id?: string | null
          cancel_reason?: string | null
          cargo_weight_tons?: number | null
          carrier_id?: string | null
          created_at?: string
          dest_city?: string
          dest_location_id?: string | null
          distance_km?: number | null
          driver_id?: string | null
          empty_reason?: string | null
          exception?: string | null
          id?: string
          is_empty?: boolean
          number?: string
          order_id?: string | null
          origin_city?: string
          origin_location_id?: string | null
          parent_trip_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          stage?: string
          status?: string
          tractor_id?: string | null
          trailer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_backup_driver_id_fkey"
            columns: ["backup_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_dest_location_id_fkey"
            columns: ["dest_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "transport_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_origin_location_id_fkey"
            columns: ["origin_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_parent_trip_id_fkey"
            columns: ["parent_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_tractor_id_fkey"
            columns: ["tractor_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          asset_id: string
          closed_at: string | null
          created_at: string
          description: string
          id: string
          inspection_id: string | null
          kind: string
          labor_cost: number
          number: string
          opened_at: string
          parts_cost: number
          status: string
          technician: string | null
          vendor_invoice_ref: string | null
          workshop: string | null
        }
        Insert: {
          asset_id: string
          closed_at?: string | null
          created_at?: string
          description: string
          id?: string
          inspection_id?: string | null
          kind?: string
          labor_cost?: number
          number?: string
          opened_at?: string
          parts_cost?: number
          status?: string
          technician?: string | null
          vendor_invoice_ref?: string | null
          workshop?: string | null
        }
        Update: {
          asset_id?: string
          closed_at?: string | null
          created_at?: string
          description?: string
          id?: string
          inspection_id?: string | null
          kind?: string
          labor_cost?: number
          number?: string
          opened_at?: string
          parts_cost?: number
          status?: string
          technician?: string | null
          vendor_invoice_ref?: string | null
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_payment: {
        Args: { p_amount: number; p_invoice_id: string; p_payment_id: string }
        Returns: undefined
      }
      assign_trip_resources: {
        Args: {
          p_driver_id: string
          p_end: string
          p_override_reason?: string
          p_start: string
          p_tractor_id: string
          p_trailer_id: string
          p_trip_id: string
        }
        Returns: undefined
      }
      cancel_trip: {
        Args: { p_reason: string; p_trip_id: string }
        Returns: undefined
      }
      close_trip: { Args: { p_trip_id: string }; Returns: undefined }
      create_invoice_from_trips: {
        Args: {
          p_customer_id: string
          p_discount?: number
          p_trip_ids: string[]
        }
        Returns: string
      }
      current_driver_id: { Args: never; Returns: string }
      driver_my_trips: {
        Args: never
        Returns: {
          actual_start: string
          cargo_type: string
          consignee: string
          customer_name: string
          delivery_instructions: string
          delivery_name: string
          dest_city: string
          dest_lat: number
          dest_lng: number
          distance_km: number
          exception: string
          id: string
          number: string
          order_number: string
          origin_city: string
          origin_lat: number
          origin_lng: number
          pickup_name: string
          planned_end: string
          planned_start: string
          quantity: number
          stage: string
          status: string
          tractor_code: string
          tractor_id: string
          trailer_code: string
          trailer_id: string
          unit: string
          weight_kg: number
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      record_trip_event: {
        Args: {
          p_client_event_id?: string
          p_event_type: string
          p_lat?: number
          p_lng?: number
          p_location?: string
          p_notes?: string
          p_occurred_at?: string
          p_trip_id: string
        }
        Returns: string
      }
      reinspect_ok: { Args: { p_inspection_id: string }; Returns: undefined }
      review_expense: {
        Args: { p_approve: boolean; p_id: string; p_reason?: string }
        Returns: undefined
      }
      set_work_order_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      settle_advance: { Args: { p_id: string }; Returns: number }
    }
    Enums: {
      app_role:
        | "owner"
        | "ops_manager"
        | "dispatcher"
        | "fleet_supervisor"
        | "accountant"
        | "maintenance"
        | "driver"
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
      app_role: [
        "owner",
        "ops_manager",
        "dispatcher",
        "fleet_supervisor",
        "accountant",
        "maintenance",
        "driver",
      ],
    },
  },
} as const
