<?php

namespace App\Http\Controllers;

use App\Models\Address;
use App\Models\Metafield;
use App\Models\Session;
use Illuminate\Http\Request;

class MetafieldController extends Controller
{
    public $helper;

    function __construct()
    {
        $this->helper = new HelperController();
    }

    public function metafield(Request $request){
        $session = Session::first();
        // Group addresses by the 'code' column in the database query
        $groupedAddresses = Address::select('code', 'state', 'city', 'district', 'subdistrict', 'postalcode')
            ->groupBy('code', 'state', 'city', 'district', 'subdistrict', 'postalcode')
            ->get()
            ->groupBy('code');

        if(!empty($groupedAddresses)){
            foreach ($groupedAddresses as $key => $address){
                $metafield = Metafield::where('code',$key)->whereNotNull('metafield_id')->first();
                if($metafield == null){
                    $metafield = new Metafield();
                }
                $metafield->code = $key;
                $metafield->save();
                $data = $address->toArray();
                $res = $this->createUpdateAddressMetafields($session,$key,$data,$metafield);

            }
        }
        dd('done');
    }

    public function createUpdateAddressMetafields($session,$key,$data, $metafield)
    {
        $data =
            [
                "metafield" => [
                    "key" => "code_".$key,
                    "value" => json_encode($data),
                    "type" => "json",
                    "namespace" => "address_field"
                ]
            ];
        if (isset($metafield->metafield_id)) {

            $meta_field_update = $this->helper->getShopApi($session->shop)
                ->rest('PUT', "/admin/api/2024-01/metafields/" . $metafield->metafield_id . '.json', $data);
            if ($meta_field_update['errors'] == false) {
                $meta_field_update = $meta_field_update['body']['metafield'];
                $metafield->metafield_id = $meta_field_update->id;
                $metafield->save();
            }

            return $meta_field_update;
        } else {

            $meta_field_create = $this->helper->getShopApi($session->shop)->rest('POST', "/admin/api/2024-01/metafields.json", $data);
            if ($meta_field_create['errors'] == false) {
                $meta_field_create = $meta_field_create['body']['metafield'];
                $metafield->metafield_id = $meta_field_create->id;
                $metafield->save();
            }

            return $meta_field_create;
        }
    }

}
