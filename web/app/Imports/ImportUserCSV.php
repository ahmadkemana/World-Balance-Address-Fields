<?php

namespace App\Imports;

use App\Models\Address;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\Fluent\Concerns\Has;
use Maatwebsite\Excel\Concerns\ToCollection;


class ImportUserCSV implements ToCollection
{
    /**
    * @param Collection $collection
    */
    public function collection(Collection $collections)
    {

        try {
//            to upload the some extra details of the user like user phone number

            foreach ($collections as $key => $collection){
                if($key != 0){
                    $address = Address::where('code',$collection[0])->where('state',$collection[1])
                        ->where('city',$collection[2])->where('district',$collection[3])
                        ->where('subdistrict',$collection[4])->where('postalcode',$collection[5])->first();
                    if($address == null){
                        $address = new Address();
                    }
                    $address->code = $collection[0];
                    $address->state = $collection[1];
                    $address->city = $collection[2];
                    $address->district = $collection[3];
                    $address->subdistrict = $collection[4];
                    $address->postalcode = $collection[5];
                    $address->save();
                }
            }

        }catch (\Exception $exception){
            dd($exception->getMessage());
        }

        return true;
    }

}
