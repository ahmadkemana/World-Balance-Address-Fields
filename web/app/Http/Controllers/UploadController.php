<?php

namespace App\Http\Controllers;

use App\Imports\ImportUserCSV;
use App\Models\Address;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class UploadController extends Controller
{
    public function upload_index(Request $request)
    {
        return view('upload');
    }

    public function upload(Request $request)
    {

        Excel::import(new ImportUserCSV, $request->file('csv_file'));

        return redirect()->back()->with('success', 'CSV file uploaded and data imported.');
    }

    public function get_address(Request $request)
    {
        $address = Address::query();
        if (isset($request->code) && $request->code != "") {
            $address->where('code', 'like', '%' . $request->code . '%');
        }
        if (isset($request->city) && $request->city != "") {
            $address->where('city', 'like', '%' . $request->city . '%');
        }
        if (isset($request->state) && $request->state != "") {
            $address->where('state', 'like', '%' . $request->state . '%');
        }
        if (isset($request->district) && $request->district != "") {
            $address->where('district', 'like', '%' . $request->district . '%');
        }
        if (isset($request->subdistrict) && $request->subdistrict != "") {
            $address->where('subdistrict', 'like', '%' . $request->subdistrict . '%');
        }
        if (isset($request->postalcode) && $request->postalcode != "") {
            $address->where('postalcode', 'like', '%' . $request->postalcode . '%');
        }
        $addresses = $address->orderBy('city', 'asc')->get();
        $data = [
            'addresses' => $addresses
        ];
        return response()->json($data);
    }


    public function add_address(Request $request)
    {
        try {

            $address = new Address();
            $address->code = isset($request->code) && $request->code != '' ? $request->code : null;
            $address->state = isset($request->state) && $request->state != '' ? $request->state : null;
            $address->city = isset($request->city) && $request->city != '' ? $request->city : null;
            $address->district = isset($request->district) && $request->district != '' ? $request->district : null;
            $address->subdistrict = isset($request->subdistrict) && $request->subdistrict != '' ? $request->subdistrict : null;
            $address->postalcode = isset($request->postalcode) && $request->postalcode != '' ? $request->postalcode : null;
            $address->save();
            $data = [
                'status' => 'success',
                'address' => $address
            ];
            return response()->json($data);
        } catch (\Exception $e) {

            $data = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
            return response()->json($data);
        }
    }

    public function delete_address(Request $request, $id)
    {
        try {
            $address = Address::find($id);
            $address->delete();
            $data = [
                'status' => 'success'
            ];
            return response()->json($data);
        } catch (\Exception $e) {

            $data = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
            return response()->json($data);
        }
    }

    public function update_address(Request $request, $id)
    {
        try {

            $address = Address::find($id);
            $address->code = isset($request->code) && $request->code != '' ? $request->code : null;
            $address->state = isset($request->state) && $request->state != '' ? $request->state : null;
            $address->city = isset($request->city) && $request->city != '' ? $request->city : null;
            $address->district = isset($request->district) && $request->district != '' ? $request->district : null;
            $address->subdistrict = isset($request->subdistrict) && $request->subdistrict != '' ? $request->subdistrict : null;
            $address->postalcode = isset($request->postalcode) && $request->postalcode != '' ? $request->postalcode : null;
            $address->save();
            $data = [
                'status' => 'success',
                'address' => $address
            ];
            return response()->json($data);
        } catch (\Exception $e) {

            $data = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
            return response()->json($data);
        }
    }
}
