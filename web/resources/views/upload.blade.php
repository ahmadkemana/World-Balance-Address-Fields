<!doctype html>
<html lang="en">
<head>

    <title>asdasd</title></head>
<body>
    <form method="post" action="{{route('upload.data')}}" enctype="multipart/form-data">
        @csrf
        <input type="file" name="csv_file" />
        <button type="submit">Save</button>
    </form>
</body>
</html>
