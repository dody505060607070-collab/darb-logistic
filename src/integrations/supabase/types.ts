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
      activity_events: {
        Row: {
          at: string
          detail: string | null
          id: number
          kind: string
          user_id: string
        }
        Insert: {
          at?: string
          detail?: string | null
          id?: never
          kind: string
          user_id?: string
        }
        Update: {
          at?: string
          detail?: string | null
          id?: never
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_phone_reservations: {
        Row: {
          created_at: string
          phone: string
        }
        Insert: {
          created_at?: string
          phone: string
        }
        Update: {
          created_at?: string
          phone?: string
        }
        Relationships: []
      }
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
      ai_reports: {
        Row: {
          body: string
          created_at: string
          id: string
          report_date: string
          source: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          report_date: string
          source?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          report_date?: string
          source?: string
        }
        Relationships: []
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
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          recipient_id: string | null
          sender_id: string
          sender_name: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          recipient_id?: string | null
          sender_id?: string
          sender_name?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          recipient_id?: string | null
          sender_id?: string
          sender_name?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          company_name: string
          cr_number: string | null
          doc_alert_days: number[]
          doc_expiry_warning_days: number
          doc_required_asset: string[]
          doc_required_driver: string[]
          id: number
          timezone: string
          updated_at: string
          vat_number: string | null
          vat_rate: number
        }
        Insert: {
          company_name?: string
          cr_number?: string | null
          doc_alert_days?: number[]
          doc_expiry_warning_days?: number
          doc_required_asset?: string[]
          doc_required_driver?: string[]
          id?: number
          timezone?: string
          updated_at?: string
          vat_number?: string | null
          vat_rate?: number
        }
        Update: {
          company_name?: string
          cr_number?: string | null
          doc_alert_days?: number[]
          doc_expiry_warning_days?: number
          doc_required_asset?: string[]
          doc_required_driver?: string[]
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
      crm_activities: {
        Row: {
          completed: boolean
          created_at: string
          created_by: string
          customer_id: string
          due_at: string | null
          id: string
          kind: string
          summary: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          created_by?: string
          customer_id: string
          due_at?: string | null
          id?: string
          kind?: string
          summary: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          created_by?: string
          customer_id?: string
          due_at?: string | null
          id?: string
          kind?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_opportunities: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string
          expected_close: string | null
          id: string
          next_follow_up: string | null
          notes: string | null
          probability: number
          stage: string
          title: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          customer_id: string
          expected_close?: string | null
          id?: string
          next_follow_up?: string | null
          notes?: string | null
          probability?: number
          stage?: string
          title: string
          value?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string
          expected_close?: string | null
          id?: string
          next_follow_up?: string | null
          notes?: string | null
          probability?: number
          stage?: string
          title?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_customer_id_fkey"
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
      customer_requests: {
        Row: {
          cargo_type: string
          close_reason: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          customer_id: string
          delivery_city: string | null
          delivery_location_id: string | null
          id: string
          notes: string | null
          number: string
          order_id: string | null
          pickup_from: string | null
          pickup_location_id: string | null
          quantity: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          unit: string | null
          weight_kg: number | null
        }
        Insert: {
          cargo_type: string
          close_reason?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          customer_id: string
          delivery_city?: string | null
          delivery_location_id?: string | null
          id?: string
          notes?: string | null
          number?: string
          order_id?: string | null
          pickup_from?: string | null
          pickup_location_id?: string | null
          quantity?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          unit?: string | null
          weight_kg?: number | null
        }
        Update: {
          cargo_type?: string
          close_reason?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          delivery_city?: string | null
          delivery_location_id?: string | null
          id?: string
          notes?: string | null
          number?: string
          order_id?: string | null
          pickup_from?: string | null
          pickup_location_id?: string | null
          quantity?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          unit?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_delivery_location_id_fkey"
            columns: ["delivery_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "transport_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
      delay_notices: {
        Row: {
          created_at: string
          driver_id: string
          expected_at: string
          id: string
          reason: string
          reply: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          expected_at: string
          id?: string
          reason: string
          reply?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trip_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          expected_at?: string
          id?: string
          reason?: string
          reply?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delay_notices_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delay_notices_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
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
      gps_provider_vehicles: {
        Row: {
          asset_id: string | null
          car_name: string | null
          created_at: string
          gps_time: string | null
          id: string
          ignition: boolean | null
          lat: number | null
          lng: number | null
          plate: string | null
          plate_key: string | null
          provider: string
          provider_vehicle_id: string
          speed_kmh: number | null
          synced_at: string
          vehicle_state: string | null
        }
        Insert: {
          asset_id?: string | null
          car_name?: string | null
          created_at?: string
          gps_time?: string | null
          id?: string
          ignition?: boolean | null
          lat?: number | null
          lng?: number | null
          plate?: string | null
          plate_key?: string | null
          provider?: string
          provider_vehicle_id: string
          speed_kmh?: number | null
          synced_at?: string
          vehicle_state?: string | null
        }
        Update: {
          asset_id?: string | null
          car_name?: string | null
          created_at?: string
          gps_time?: string | null
          id?: string
          ignition?: boolean | null
          lat?: number | null
          lng?: number | null
          plate?: string | null
          plate_key?: string | null
          provider?: string
          provider_vehicle_id?: string
          speed_kmh?: number | null
          synced_at?: string
          vehicle_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_provider_vehicles_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
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
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
      login_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      maintenance_history: {
        Row: {
          actor: string
          at: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
          work_order_id: string
        }
        Insert: {
          actor: string
          at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
          work_order_id: string
        }
        Update: {
          actor?: string
          at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
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
      maintenance_wallet_entries: {
        Row: {
          amount: number
          asset_id: string | null
          client_ref: string
          created_at: string
          created_by: string
          description: string
          employee_id: string
          id: string
          kind: string
          occurred_at: string
          receipt_path: string | null
          reference: string | null
          reversal_of: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          supplier: string | null
          work_order_id: string | null
        }
        Insert: {
          amount: number
          asset_id?: string | null
          client_ref: string
          created_at?: string
          created_by: string
          description: string
          employee_id: string
          id?: string
          kind: string
          occurred_at?: string
          receipt_path?: string | null
          reference?: string | null
          reversal_of?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supplier?: string | null
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          asset_id?: string | null
          client_ref?: string
          created_at?: string
          created_by?: string
          description?: string
          employee_id?: string
          id?: string
          kind?: string
          occurred_at?: string
          receipt_path?: string | null
          reference?: string | null
          reversal_of?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supplier?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_wallet_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_wallet_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_wallet_entries_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "maintenance_wallet_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_wallet_entries_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
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
      person_intakes: {
        Row: {
          completed_user_id: string | null
          created_at: string
          created_by: string
          extracted: Json
          file_paths: string[]
          full_name: string | null
          id: string
          missing: string[]
          notified_at: string | null
          person_type: string
          phone: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_user_id?: string | null
          created_at?: string
          created_by?: string
          extracted?: Json
          file_paths?: string[]
          full_name?: string | null
          id?: string
          missing?: string[]
          notified_at?: string | null
          person_type?: string
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_user_id?: string | null
          created_at?: string
          created_by?: string
          extracted?: Json
          file_paths?: string[]
          full_name?: string | null
          id?: string
          missing?: string[]
          notified_at?: string | null
          person_type?: string
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      return_requests: {
        Row: {
          cargo_description: string | null
          cargo_size: string | null
          created_at: string
          depart_at: string
          driver_id: string
          has_cargo: boolean
          id: string
          load_level: string | null
          notes: string | null
          pickup_place: string | null
          reject_reason: string | null
          return_trip_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trip_id: string
        }
        Insert: {
          cargo_description?: string | null
          cargo_size?: string | null
          created_at?: string
          depart_at: string
          driver_id: string
          has_cargo?: boolean
          id?: string
          load_level?: string | null
          notes?: string | null
          pickup_place?: string | null
          reject_reason?: string | null
          return_trip_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trip_id: string
        }
        Update: {
          cargo_description?: string | null
          cargo_size?: string | null
          created_at?: string
          depart_at?: string
          driver_id?: string
          has_cargo?: boolean
          id?: string
          load_level?: string | null
          notes?: string | null
          pickup_place?: string | null
          reject_reason?: string | null
          return_trip_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_return_trip_id_fkey"
            columns: ["return_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_trip_id_fkey"
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
      task_notifications: {
        Row: {
          accepted_at: string | null
          attempts: number
          claimed_at: string | null
          created_at: string
          error: string | null
          event: string
          id: string
          next_attempt_at: string
          payload: Json
          provider_id: string | null
          recipient_id: string
          state: string
          task_id: string
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          event: string
          id?: string
          next_attempt_at?: string
          payload: Json
          provider_id?: string | null
          recipient_id: string
          state?: string
          task_id: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          next_attempt_at?: string
          payload?: Json
          provider_id?: string | null
          recipient_id?: string
          state?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string
          assignee_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          done_note: string | null
          due_at: string | null
          id: string
          lat: number | null
          lng: number | null
          location_text: string | null
          next_reminder_at: string
          photo_path: string | null
          priority: string
          reminders_sent: number
          requested_by_external: string | null
          review_note: string | null
          status: string
          submitted_at: string | null
          title: string
          whatsapp_status: string
        }
        Insert: {
          assigned_by?: string
          assignee_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          done_note?: string | null
          due_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          next_reminder_at?: string
          photo_path?: string | null
          priority?: string
          reminders_sent?: number
          requested_by_external?: string | null
          review_note?: string | null
          status?: string
          submitted_at?: string | null
          title: string
          whatsapp_status?: string
        }
        Update: {
          assigned_by?: string
          assignee_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          done_note?: string | null
          due_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          next_reminder_at?: string
          photo_path?: string | null
          priority?: string
          reminders_sent?: number
          requested_by_external?: string | null
          review_note?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          whatsapp_status?: string
        }
        Relationships: []
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
      trip_alerts: {
        Row: {
          cleared_at: string | null
          distance_m: number | null
          id: string
          kind: string
          last_seen_at: string
          lat: number | null
          lng: number | null
          minutes: number | null
          opened_at: string
          reason: string | null
          reason_at: string | null
          trip_id: string
        }
        Insert: {
          cleared_at?: string | null
          distance_m?: number | null
          id?: string
          kind: string
          last_seen_at?: string
          lat?: number | null
          lng?: number | null
          minutes?: number | null
          opened_at?: string
          reason?: string | null
          reason_at?: string | null
          trip_id: string
        }
        Update: {
          cleared_at?: string | null
          distance_m?: number | null
          id?: string
          kind?: string
          last_seen_at?: string
          lat?: number | null
          lng?: number | null
          minutes?: number | null
          opened_at?: string
          reason?: string | null
          reason_at?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_alerts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_assignment_history: {
        Row: {
          actor: string | null
          driver_id: string | null
          ended_at: string | null
          id: string
          started_at: string
          tractor_id: string | null
          trailer_id: string | null
          trip_id: string
        }
        Insert: {
          actor?: string | null
          driver_id?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          tractor_id?: string | null
          trailer_id?: string | null
          trip_id: string
        }
        Update: {
          actor?: string | null
          driver_id?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          tractor_id?: string | null
          trailer_id?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_assignment_history_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
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
      trip_routes: {
        Row: {
          computed_at: string
          distance_km: number | null
          duration_min: number | null
          points: Json
          provider: string
          trip_id: string
        }
        Insert: {
          computed_at?: string
          distance_km?: number | null
          duration_min?: number | null
          points: Json
          provider: string
          trip_id: string
        }
        Update: {
          computed_at?: string
          distance_km?: number | null
          duration_min?: number | null
          points?: Json
          provider?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_routes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stops: {
        Row: {
          arrived_at: string | null
          city: string | null
          created_at: string
          created_by: string | null
          done_at: string | null
          id: string
          lat: number
          lng: number
          location_id: string | null
          name: string
          notes: string | null
          seq: number
          status: string
          trip_id: string
        }
        Insert: {
          arrived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          lat: number
          lng: number
          location_id?: string | null
          name: string
          notes?: string | null
          seq?: number
          status?: string
          trip_id: string
        }
        Update: {
          arrived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          lat?: number
          lng?: number
          location_id?: string | null
          name?: string
          notes?: string | null
          seq?: number
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
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
      whatsapp_outbox: {
        Row: {
          accepted_at: string | null
          attempts: number
          body: string
          claimed_at: string | null
          created_at: string
          entity_id: string | null
          error: string | null
          event: string
          id: string
          phone: string
          provider_id: string | null
          state: string
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          body: string
          claimed_at?: string | null
          created_at?: string
          entity_id?: string | null
          error?: string | null
          event: string
          id?: string
          phone: string
          provider_id?: string | null
          state?: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          body?: string
          claimed_at?: string | null
          created_at?: string
          entity_id?: string | null
          error?: string | null
          event?: string
          id?: string
          phone?: string
          provider_id?: string | null
          state?: string
        }
        Relationships: []
      }
      work_order_lines: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          kind: string
          qty: number
          unit_price: number
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          id?: string
          kind: string
          qty?: number
          unit_price?: number
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          kind?: string
          qty?: number
          unit_price?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          approval_note: string | null
          approved_budget: number | null
          approved_by: string | null
          asset_id: string
          assignee_id: string | null
          closed_at: string | null
          created_at: string
          description: string
          diagnosis: string | null
          estimate: number | null
          expected_at: string | null
          id: string
          inspection_id: string | null
          intake_ref: string | null
          kind: string
          labor_cost: number
          number: string
          odometer_km: number | null
          opened_at: string
          parts_cost: number
          photo_paths: string[]
          received_by: string | null
          requested_by: string | null
          severity: string
          status: string
          technician: string | null
          vendor_invoice_ref: string | null
          warranty_days: number | null
          work_done: string | null
          workflow_status: string
          workshop: string | null
          workshop_id: string | null
        }
        Insert: {
          approval_note?: string | null
          approved_budget?: number | null
          approved_by?: string | null
          asset_id: string
          assignee_id?: string | null
          closed_at?: string | null
          created_at?: string
          description: string
          diagnosis?: string | null
          estimate?: number | null
          expected_at?: string | null
          id?: string
          inspection_id?: string | null
          intake_ref?: string | null
          kind?: string
          labor_cost?: number
          number?: string
          odometer_km?: number | null
          opened_at?: string
          parts_cost?: number
          photo_paths?: string[]
          received_by?: string | null
          requested_by?: string | null
          severity?: string
          status?: string
          technician?: string | null
          vendor_invoice_ref?: string | null
          warranty_days?: number | null
          work_done?: string | null
          workflow_status?: string
          workshop?: string | null
          workshop_id?: string | null
        }
        Update: {
          approval_note?: string | null
          approved_budget?: number | null
          approved_by?: string | null
          asset_id?: string
          assignee_id?: string | null
          closed_at?: string | null
          created_at?: string
          description?: string
          diagnosis?: string | null
          estimate?: number | null
          expected_at?: string | null
          id?: string
          inspection_id?: string | null
          intake_ref?: string | null
          kind?: string
          labor_cost?: number
          number?: string
          odometer_km?: number | null
          opened_at?: string
          parts_cost?: number
          photo_paths?: string[]
          received_by?: string | null
          requested_by?: string | null
          severity?: string
          status?: string
          technician?: string | null
          vendor_invoice_ref?: string | null
          warranty_days?: number | null
          work_done?: string | null
          workflow_status?: string
          workshop?: string | null
          workshop_id?: string | null
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
            foreignKeyName: "work_orders_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_members: {
        Row: {
          id: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          id?: string
          user_id: string
          workshop_id: string
        }
        Update: {
          id?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_members_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshops: {
        Row: {
          archived_at: string | null
          branch_id: string | null
          created_at: string
          id: string
          kind: string
          name: string
          phone: string | null
        }
        Insert: {
          archived_at?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name: string
          phone?: string | null
        }
        Update: {
          archived_at?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshops_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_delay: {
        Args: { p_id: string; p_reply: string }
        Returns: undefined
      }
      allocate_payment: {
        Args: { p_amount: number; p_invoice_id: string; p_payment_id: string }
        Returns: undefined
      }
      apply_reserved_phone_owner: {
        Args: { p_user_id: string; p_verified_phone: string }
        Returns: undefined
      }
      approve_return_request: {
        Args: { p_request_id: string }
        Returns: string
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
      can_access_work_order: { Args: { p_id: string }; Returns: boolean }
      cancel_trip: {
        Args: { p_reason: string; p_trip_id: string }
        Returns: undefined
      }
      chat_directory: {
        Args: never
        Returns: {
          full_name: string
          id: string
          role: string
        }[]
      }
      claim_task_notification: {
        Args: { p_id: string }
        Returns: {
          accepted_at: string | null
          attempts: number
          claimed_at: string | null
          created_at: string
          error: string | null
          event: string
          id: string
          next_attempt_at: string
          payload: Json
          provider_id: string | null
          recipient_id: string
          state: string
          task_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "task_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_whatsapp_message: {
        Args: { p_id: string }
        Returns: {
          accepted_at: string | null
          attempts: number
          body: string
          claimed_at: string | null
          created_at: string
          entity_id: string | null
          error: string | null
          event: string
          id: string
          phone: string
          provider_id: string | null
          state: string
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_trip_alert: {
        Args: { p_kind: string; p_trip_id: string }
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
      create_return_trip: {
        Args: {
          p_dest_location: string
          p_distance: number
          p_end: string
          p_origin_location: string
          p_request_id: string
          p_start: string
          p_trip_id: string
        }
        Returns: string
      }
      current_driver_id: { Args: never; Returns: string }
      custody_return: {
        Args: {
          p_fuel: string
          p_id: string
          p_odometer: number
          p_transfer_to?: string
        }
        Returns: string
      }
      driver_explain_alert: {
        Args: { p_alert_id: string; p_reason: string }
        Returns: undefined
      }
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
      driver_report_delay: {
        Args: { p_expected_at: string; p_reason: string; p_trip_id: string }
        Returns: string
      }
      driver_report_location: {
        Args: {
          p_event_time: string
          p_lat: number
          p_lng: number
          p_reading_id: string
          p_speed: number
          p_trip_id: string
        }
        Returns: undefined
      }
      driver_request_return: {
        Args: { p_depart_at: string; p_notes: string; p_trip_id: string }
        Returns: string
      }
      driver_request_return_v2: {
        Args: {
          p_cargo_description: string
          p_cargo_size: string
          p_depart_at: string
          p_has_cargo: boolean
          p_load_level: string
          p_notes: string
          p_pickup_place: string
          p_trip_id: string
        }
        Returns: string
      }
      driver_stop_update: {
        Args: { p_status: string; p_stop_id: string }
        Returns: undefined
      }
      driver_trip_plan: { Args: { p_trip_id: string }; Returns: Json }
      driver_trips_for: {
        Args: { p_driver_id: string }
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
      driver_wa_phone: { Args: { p_driver: string }; Returns: string }
      enqueue_due_task_reminders: { Args: never; Returns: number }
      enqueue_task_event: {
        Args: {
          p_event: string
          p_task: Database["public"]["Tables"]["tasks"]["Row"]
        }
        Returns: undefined
      }
      generate_critical_alerts: { Args: never; Returns: number }
      gps_add_vehicle_to_fleet: {
        Args: { p_id: string; p_kind: string }
        Returns: string
      }
      gps_link_vehicle: {
        Args: { p_asset_id: string; p_id: string }
        Returns: undefined
      }
      gps_provider_push_reading: { Args: { p_id: string }; Returns: undefined }
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
      maintenance_details: {
        Args: {
          p_diagnosis: string
          p_estimate: number
          p_id: string
          p_invoice?: string
          p_labor: number
        }
        Returns: undefined
      }
      maintenance_request: {
        Args: {
          p_asset_id: string
          p_description: string
          p_photos?: string[]
          p_severity?: string
        }
        Returns: string
      }
      maintenance_transition: {
        Args: {
          p_amount?: number
          p_assignee_id?: string
          p_id: string
          p_note?: string
          p_target: string
          p_workshop_id?: string
        }
        Returns: undefined
      }
      open_trip_alert: {
        Args: {
          p_distance_m: number
          p_kind: string
          p_lat: number
          p_lng: number
          p_minutes: number
          p_trip_id: string
        }
        Returns: boolean
      }
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
      reject_return_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      review_expense: {
        Args: { p_approve: boolean; p_id: string; p_reason?: string }
        Returns: undefined
      }
      set_work_order_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      settle_advance: { Args: { p_id: string }; Returns: number }
      shitaa_acceptance_checks: { Args: never; Returns: Json }
      submit_delivery: {
        Args: {
          p_captured_at?: string
          p_client_ref: string
          p_damaged: number
          p_lat?: number
          p_lng?: number
          p_notes?: string
          p_phone?: string
          p_photos: string[]
          p_quantity: number
          p_receiver: string
          p_short: number
          p_signature: string
          p_trip_id: string
        }
        Returns: string
      }
      task_review: {
        Args: { p_approve: boolean; p_id: string; p_note: string }
        Returns: undefined
      }
      task_submit: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      wa_admins: {
        Args: { p_body: string; p_entity: string; p_event: string }
        Returns: undefined
      }
      wa_department: {
        Args: {
          p_body: string
          p_critical?: boolean
          p_entity: string
          p_event: string
        }
        Returns: undefined
      }
      wa_enqueue: {
        Args: {
          p_body: string
          p_entity: string
          p_event: string
          p_phone: string
        }
        Returns: undefined
      }
      wa_event_label: { Args: { p: string }; Returns: string }
      wa_event_roles: {
        Args: { p_critical?: boolean; p_event: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      wa_norm: { Args: { p: string }; Returns: string }
      wa_phone_inline: { Args: { p: string }; Returns: string }
      wa_phone_line: { Args: { p: string; p_label: string }; Returns: string }
      wa_trip_status_label: { Args: { s: string }; Returns: string }
      wallet_balances: {
        Args: never
        Returns: {
          balance: number
          employee_id: string
          maintenance_cost: number
          pending_expenses: number
        }[]
      }
      wallet_create: {
        Args: {
          p_amount: number
          p_asset?: string
          p_client_ref: string
          p_description: string
          p_employee: string
          p_kind: string
          p_receipt?: string
          p_reference?: string
          p_reversal?: string
          p_supplier?: string
          p_work_order?: string
        }
        Returns: string
      }
      wallet_review: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      work_order_delete: { Args: { p_id: string }; Returns: undefined }
      work_order_edit: {
        Args: {
          p_description: string
          p_expected_at: string
          p_id: string
          p_severity: string
        }
        Returns: undefined
      }
      workshop_find_vehicle: {
        Args: { p_query: string }
        Returns: {
          code: string
          id: string
          make_model: string
          odometer_km: number
          plate: string
        }[]
      }
      workshop_intake: {
        Args: {
          p_asset_id: string
          p_description: string
          p_diagnosis: string
          p_labor: number
          p_odometer?: number
          p_parts: number
          p_photos?: string[]
          p_ref: string
          p_severity: string
          p_workshop_id: string
        }
        Returns: string
      }
      workshop_job_report: {
        Args: {
          p_id: string
          p_invoice: string
          p_lines: Json
          p_odometer: number
          p_photos: string[]
          p_technician: string
          p_warranty_days: number
          p_work_done: string
        }
        Returns: Json
      }
      workshop_remove: { Args: { p_id: string }; Returns: string }
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
        | "field_maintenance"
        | "workshop"
        | "representative"
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
        "field_maintenance",
        "workshop",
        "representative",
      ],
    },
  },
} as const
